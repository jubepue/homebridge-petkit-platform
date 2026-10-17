let PlatformAccessory;
let Accessory;
let Service;
let Characteristic;
let UUIDGen;

//Base class of Accessory
class BaseAccessory {
  constructor(platform, homebridgeAccessory, deviceConfig, categoryType, serviceType, subServices = []) {
    this.platform = platform;
    this.deviceId = deviceConfig.id;
    this.categoryType = categoryType;
    PlatformAccessory = platform.api.platformAccessory;

    ({ Accessory, Service, Characteristic, uuid: UUIDGen } = platform.api.hap);

    this.log = platform.log;
    this.homebridgeAccessory = homebridgeAccessory;
    this.deviceConfig = deviceConfig;

    // Setup caching
    this.cachedState = new Map();
    this.validCache = false;

    //Accessory Service
    this.serviceType = serviceType;

    //Accessory subServices
    this.subServices = subServices;

    //Accessory
    if (this.homebridgeAccessory) {
      this.homebridgeAccessory.controller = this;
      if (!this.homebridgeAccessory.context.deviceId) {
        this.homebridgeAccessory.context.deviceId = this.deviceConfig.id;
      }

      this.log.log(`Existing Accessory found ${homebridgeAccessory.displayName}  ${homebridgeAccessory.context.deviceId} ${homebridgeAccessory.UUID}`);
      // Keep the cached displayName stable so HomeKit scenes/automations don't churn
      if (!this.homebridgeAccessory.displayName && this.deviceConfig.name) {
        this.homebridgeAccessory.displayName = this.deviceConfig.name;
      }
    }
    else {
      // Create new Accessory
      this.log.log(`Creating New Accessory ${this.deviceConfig.id}`);
      this.homebridgeAccessory = new PlatformAccessory(
        this.deviceConfig.name,
        UUIDGen.generate(this.deviceConfig.id),
        categoryType);
      this.homebridgeAccessory.context.deviceId = this.deviceConfig.id;
      this.homebridgeAccessory.controller = this;
      this.platform.registerPlatformAccessory(this.homebridgeAccessory);
    }

    // Service
    if (this.subServices.length == 0 || this.subServices.length == 1) {
      // Service
      this.service = this.homebridgeAccessory.getService(this.serviceType);
      if (this.service) {
        this.service.setCharacteristic(Characteristic.Name, this.deviceConfig.name);
      }
      else {
        // add new service
        this.service = this.homebridgeAccessory.addService(this.serviceType, this.deviceConfig.name);
      }
    } else {
      // SubService
      for (const subService of this.subServices) {
        var service = this.homebridgeAccessory.getService(subService);
        if (service) {
          service.setCharacteristic(Characteristic.Name, subService);
        } else {
          // add new subService
          this.homebridgeAccessory.addService(this.serviceType, subService, subService);
        }
      }
    }

    this.homebridgeAccessory.on('identify', (paired, callback) => {
      callback();
    });
  }

  updateAccessory(device) {
    // Fill in missing names only — overwriting displayName on every poll
    // churns HomeKit scenes/automations (matches constructor behaviour).
    if (device.name) {
      if (!this.homebridgeAccessory.displayName) {
        this.homebridgeAccessory.displayName = device.name;
      }
      const hapAccessory = this.homebridgeAccessory._associatedHAPAccessory;
      if (hapAccessory && !hapAccessory.displayName) {
        hapAccessory.displayName = device.name;
      }
      const accessoryInformationService = (
        this.homebridgeAccessory.getService(Service.AccessoryInformation) ||
        this.homebridgeAccessory.addService(Service.AccessoryInformation));
      const characteristicName = (
        accessoryInformationService.getCharacteristic(Characteristic.Name) ||
        accessoryInformationService.addCharacteristic(Characteristic.Name));
      if (characteristicName && !characteristicName.value) {
        characteristicName.setValue(device.name);
      }
    }

    if (typeof this.homebridgeAccessory.updateReachability === 'function') {
      this.homebridgeAccessory.updateReachability(device.online);
    }
    // Update device specific state
    this.updateState(device);
  }

  setCachedState(characteristic, value) {
    this.cachedState.set(characteristic, value);
    this.validCache = true;
  }

  getCachedState(characteristic) {
    return this.cachedState.get(characteristic);
  }

  hasValidCache() {
    return this.validCache && this.cachedState.size > 0;
  }

  invalidateCache() {
    this.validCache = false;
  }
}

module.exports = BaseAccessory;
