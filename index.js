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
    this.log = new LogUtil(
      config.options.debug ? true : false;
    );
    this.config = config;
    if (!config || !config.options) {
      this.log.log('The config configuration is incorrect, disabling plugin.')
      return;
    }
    this.deviceAccessories = new Map();
    this.accessories = new Map();

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;
      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      this.api.on('didFinishLaunching', function () {
        this.log.log("Initializing PetkitPlatform...");
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

    await api.login(config.options.username, config.options.password);

    try {
      devices = await api.getDeviceList();
    } catch (e) {
      // this.log.log(JSON.stringify(e.message));
      this.log.log('Failed to get device information. Please check if the config.json is correct.')
      return;
    }

    for (const device of devices) {
      //this.log.log(JSON.stringify(device));  
      this.addAccessory(device);
    }

    let listener = new PetkitListener(api, this.log);
    this.petkitListener = listener;
    this.petkitListener.start();
    this.petkitListener.registerListener(this.onDevicesListener.bind(this));
  }

  addAccessory(device) {
    var deviceType = device.type;
    this.log.log(`Adding: ${device.name || 'unnamed'} (${deviceType} / ${device.id})`);
    // Get UUID
    const uuid = this.api.hap.uuid.generate(device.id);
    const homebridgeAccessory = this.accessories.get(uuid);

    // Construct new accessory
    let deviceAccessory;
    switch (deviceType) {
      case 'Feeder':
      case 'FeederMini':
      case 'D3':
      case 'D4':
        deviceAccessory = new FeederAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      default:
        break;
    }
  }

  //Handle device deletion, addition, status update
  async onDevicesListener(listener) {
    for (const device of listener) {
      let uuid = this.api.hap.uuid.generate(device.id);
      if (this.accessories.has(uuid)) {
        this.refreshDeviceStates(device);
      } else {
        this.addAccessory(device);
      }
    }
    for (const uuid of this.accessories.keys()) {
      let found = listener.find(x => this.api.hap.uuid.generate(x.id) == uuid);
      if (!found) {
        let homebridgeAccessory = this.accessories.get(uuid);
        this.removeAccessory(homebridgeAccessory);
      }
    }
  }

  //refresh Accessorie status
  async refreshDeviceStates(message) {
    const uuid = this.api.hap.uuid.generate(message.id);
    const deviceAccessorie = this.deviceAccessories.get(uuid);
    if (deviceAccessorie) {
      deviceAccessorie.updateState(message);
    }
  }

  // Called from device classes
  registerPlatformAccessory(platformAccessory) {
    this.log.log(`Register Platform Accessory ${platformAccessory.displayName}`);
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

  // Sample function to show how developer can remove accessory dynamically from outside event
  removeAccessory(accessory) {
    if (accessory) {
      this.log.log(`Remove Accessory ${accessory.displayName}`);
      this.api.unregisterPlatformAccessories(pluginName, platformName, [accessory]);
      this.accessories.delete(accessory.UUID);
      this.deviceAccessories.delete(accessory.UUID);
    }
  }

}
