const BaseAccessory = require('./baseaccessory')

let Accessory;
let Service;
let Characteristic;
let UUIDGen;

class FeederAccessory extends BaseAccessory {
  constructor(platform, homebridgeAccessory, deviceConfig) {

    ({ Accessory, Characteristic, Service } = platform.api.hap);
    super(
      platform,
      homebridgeAccessory,
      deviceConfig,
      Accessory.Categories.FAN,
      Service.Fanv2
    );
    this.statusArr= deviceConfig.state ? deviceConfig.state : {};
    this.deviceType = deviceConfig.type;
    this.deviceId = deviceConfig.id;
    //support feeder switchs & sensors
    this.addService(Service.Switch, "Food Dispenser");
    this.addService(Service.OccupancySensor, "Door");
    this.addService(Service.OccupancySensor, "Food");

    this.refreshAccessoryServiceIfNeed(this.statusArr, false);
  }

  //addService function
  addService(serviceType, name) {
    // Service
    var service = this.homebridgeAccessory.getService(name);
    if (service) {
      service.setCharacteristic(Characteristic.Name, name);
    } else {
      // add new service
      this.homebridgeAccessory.addService(serviceType, name, name);
    }
  }

  //init Or refresh AccessoryService
  refreshAccessoryServiceIfNeed(statusArr, isRefresh) {
    this.isRefresh = isRefresh;
    if (!this.isRefresh) {
      this.normalAsync(Characteristic.RotationSpeed, 40, this.service);
    }
    let service = this.homebridgeAccessory.getService("Food Dispenser");
    this.eventAsync(Characteristic.On, false, service);
    let blk_d = null;
    for (const statusMap in statusArr) {
      switch (statusMap) {
        case 'errorCode':
          blk_d = statusArr[statusMap] === 'blk_d' ? 1 : 0;
        case 'door':
          service = this.homebridgeAccessory.getService("Door");
          this.normalAsync(Characteristic.OccupancyDetected, blk_d == 1 ? 1 : 0, service);
          break;
        case 'food':
          service = this.homebridgeAccessory.getService("Food");
          this.normalAsync(Characteristic.OccupancyDetected, statusArr[statusMap] ? 0 : 1, service);
          break;
        default:
          break;
      }
    }
  }

  normalAsync(name, hbValue, service = null) {
    const key = service.displayName + "-" + name.UUID;
    this.setCachedState(key, hbValue);
    if (this.isRefresh) {
      (service ? service : this.service)
        .getCharacteristic(name)
        .updateValue(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, service);
    }
  }

  eventAsync(name, hbValue, service = null) {
    const key = service.displayName + "-" + name.UUID;
    this.setCachedState(key, hbValue);
    if (this.isRefresh) {
      (service ? service : this.service)
        .getCharacteristic(name)
        .sendEventNotification(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, service);
    }
  }

  getAccessoryCharacteristic(name, service = null) {
    const key = service.displayName + "-" + name.UUID;
    //set  Accessory service Characteristic
    (service ? service : this.service).getCharacteristic(name)
      .on('get', callback => {
        if (this.hasValidCache()) {
          callback(null, this.getCachedState(key));
        }
      })
      .on('set', async (value, callback) => {
        const command = this.getSendParam(name, value);   
        this.platform.petkitOpenApi.sendCommand(command).then(async () => {
          this.setCachedState(key, value);
          const device = await this.refreshDevice();
          this.updateState(device, true);
          callback();
        }).catch((error) => {
          this.log.error('[SET][%s] Characteristic Error: %s', this.homebridgeAccessory.displayName, error);
          this.invalidateCache();
          callback(error);
        });
      });
  }

  async refreshDevice() {
    await this.platform.petkitOpenApi.login(this.platform.petkitOpenApi.username, this.platform.petkitOpenApi.password);
    const device = await this.platform.petkitOpenApi.getDeviceDetail(this.deviceType, this.deviceId);
    return device;
  }

  getSendParam(name, hbValue) {
    let command;
    let path;
    let params;
    switch (name) {
      case Characteristic.On:
        let amount = parseInt(this.service.getCharacteristic(Characteristic.RotationSpeed).value / 10) * 5;
        let date = new Date();
        path = "/" + this.deviceType.toLowerCase() + "/save_dailyfeed";
        params = {
          'amount': amount,
          'day': date.toISOString().split('T')[0].replace('-','').replace('-',''),
          'deviceId': this.deviceId,
          'time': -1
        };
        command = {
          'path': path,
          'params': params
        }
        break;
      default:
        break;
    }
    return command;
  }

  //update device status
  updateState(data) {
    this.refreshAccessoryServiceIfNeed(data.state, true);
  }
}

module.exports = FeederAccessory;
