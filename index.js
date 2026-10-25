const PetkitOpenAPI = require("./lib/petkitopenapi");
const FeederAccessory = require('./lib/feederaccessory');
const PetkitListener = require("./lib/petkitlistener");

const LogUtil = require('./util/logutil');

var Accessory, Service, Characteristic;

const pluginName = 'homebridge-petkit-platform';
const platformName = 'PetkitPlatform';

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  // registerAccessory' three parameters is plugin-name, accessory-name, constructor-name
  homebridge.registerPlatform(pluginName, platformName, PetkitPlatform, true);
}

class PetkitPlatform {
  constructor(log, config, api) {
    this.config = config;
    if (!config || !config.options) {
      log.error('The config configuration is incorrect, disabling plugin.');
      return;
    }
    this.log = new LogUtil(log, config.options.debug);
    this.deviceAccessories = new Map();
    this.accessories = new Map();

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;
      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      this.api.on('didFinishLaunching', function () {
        this.log.info("Initializing PetkitPlatform...");
        this.initPetkitSDK(config);
      }.bind(this));
    }
  }

  async initPetkitSDK(config) {
    let devices;
    let api;

    api = new PetkitOpenAPI(
      config.options.username,
      config.options.password,
      config.options.countryCode,
      this.log,
    );
    this.petkitOpenApi = api;
    this.log.info(`Using Petkit API endpoint: ${api.endpoint}`);

    try {
      await api.login(config.options.username, config.options.password);
      this.log.info('Logged in to Petkit successfully.');
    } catch (e) {
      this.log.error(`Failed to login. Please check credentials/region. ${e && e.message ? e.message : e}`);
      return;
    }
    try {
      devices = await api.getDeviceList();
      this.log.info(`Found ${devices.length} Petkit device(s).`);
      for (const device of devices) {
        this.addAccessory(device);
      }
    } catch (e) {
      this.log.error(`Failed to get device information. Will retry on the next poll. ${e && e.message ? e.message : e}`);
    }

    let listener = new PetkitListener(api, this.log);
    this.petkitListener = listener;
    this.petkitListener.start();
    this.petkitListener.registerListener(this.onDevicesListener.bind(this));
  }

  addAccessory(device) {
    var deviceType = device.type;
    this.log.info(`Adding: ${device.name || 'unnamed'} (${deviceType} / ${device.id})`);
    // Get UUID
    const uuid = this.api.hap.uuid.generate(String(device.id));
    const homebridgeAccessory = this.accessories.get(uuid);

    // Construct new accessory
    let deviceAccessory;
    try {
      switch (deviceType) {
        case 'Feeder':
        case 'FeederMini':
        case 'D3':
        case 'D4':
        case 'D4s':
        case 'D4H':
        case 'D4SH':
          deviceAccessory = new FeederAccessory(this, homebridgeAccessory, device);
          this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
          this.deviceAccessories.set(uuid, deviceAccessory);
          break;
        default:
          this.log.info(`Skipping unsupported device type: ${deviceType}`);
          break;
      }
    } catch (e) {
      this.log.error(`Failed to add accessory ${device.name || device.id} (${deviceType}): ${e && e.stack ? e.stack : e}`);
    }
  }

  // Handle device addition / status update.
  // Intentionally does NOT unregister accessories when a poll omits them —
  // unregistering drops them from HomeKit scenes/automations even if re-added
  // later with the same UUID.
  async onDevicesListener(listener) {
    if (!Array.isArray(listener)) {
      this.log.error('Ignoring device update: expected an array.');
      return;
    }
    if (listener.length === 0) {
      this.log.info('Device poll returned 0 devices; leaving existing accessories in place.');
      return;
    }

    for (const device of listener) {
      const uuid = this.api.hap.uuid.generate(String(device.id));
      if (this.accessories.has(uuid)) {
        this.refreshDeviceStates(device);
      } else {
        this.addAccessory(device);
      }
    }
  }

  //refresh Accessorie status
  async refreshDeviceStates(message) {
    const uuid = this.api.hap.uuid.generate(String(message.id));
    const deviceAccessorie = this.deviceAccessories.get(uuid);
    if (deviceAccessorie) {
      deviceAccessorie.updateAccessory(message);
    }
  }

  // Called from device classes
  registerPlatformAccessory(platformAccessory) {
    this.log.info(`Register Platform Accessory ${platformAccessory.displayName}`);
    this.api.registerPlatformAccessories(pluginName, platformName, [platformAccessory]);
  }

  // Function invoked when homebridge tries to restore cached accessory.
  // Developer can configure accessory at here (like setup event handler).
  // Update current value.
  configureAccessory(accessory) {
    // this.log("Configuring cached accessory [%s]", accessory.displayName, accessory.context.deviceId, accessory.UUID);
    // Set the accessory to reachable if plugin can currently process the accessory,
    // otherwise set to false and update the reachability later by invoking
    // accessory.updateReachability()
    accessory.reachable = true;
    accessory.on('identify', function (paired, callback) {
      // this.log.debug('[IDENTIFY][%s]', accessory.displayName);
      callback();
    });
    this.accessories.set(accessory.UUID, accessory);
  }

}
