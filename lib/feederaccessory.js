const BaseAccessory = require('./baseaccessory')

let Accessory;
let Service;
let Characteristic;

// Fresh Element Solo (D4) and YumShare Solo (D4H): API accepts 10g steps, 10–50g
const TEN_GRAM_DEVICE_TYPES = new Set(['D4', 'D4H']);

function usesTenGramPortions(deviceType) {
  return TEN_GRAM_DEVICE_TYPES.has(deviceType);
}

/**
 * Fan RotationSpeed (%) → grams
 *
 * D4 / D4H (10g steps):
 *   1–20%  → 10g
 *  21–40%  → 20g
 *  41–60%  → 30g
 *  61–80%  → 40g
 *  81–100% → 50g
 *
 * Feeder / FeederMini / D3 (5g steps):
 *   10% → 5g, 20% → 10g, … 100% → 50g
 *   (amount = floor(speed / 10) * 5)
 */
function amountFromFanSpeed(speed, deviceType) {
  const percentage = Math.max(0, Math.min(100, parseInt(speed, 10) || 0));
  if (usesTenGramPortions(deviceType)) {
    if (percentage <= 0) {
      return 10;
    }
    return Math.min(50, Math.ceil(percentage / 20) * 10);
  }
  if (percentage <= 0) {
    return 5;
  }
  return Math.min(50, Math.max(5, Math.floor(percentage / 10) * 5));
}

function normalizeDefaultFanSpeed(value, deviceType) {
  const percentage = parseInt(value, 10);
  if (usesTenGramPortions(deviceType)) {
    if (isNaN(percentage) || percentage <= 0) {
      return 40; // → 20g (same default portion as 5g models)
    }
    // Snap to nearest 20% step (20, 40, 60, 80, 100)
    return Math.min(100, Math.max(20, Math.round(percentage / 20) * 20));
  }
  if (isNaN(percentage) || percentage <= 0) {
    return 40; // → 20g (preserves pre-config hard-coded default)
  }
  // Snap to nearest 10% step (10 … 100) so amount lands on a 5g portion
  return Math.min(100, Math.max(10, Math.round(percentage / 10) * 10));
}

class FeederAccessory extends BaseAccessory {
  constructor(platform, homebridgeAccessory, deviceConfig) {
    ({ Accessory, Characteristic, Service } = platform.api.hap);
    const Categories = platform.api.hap.Categories || Accessory.Categories;
    super(
      platform,
      homebridgeAccessory,
      deviceConfig,
      Categories.FAN,
      Service.Fanv2
    );
    this.statusArr = deviceConfig.state ? deviceConfig.state : {};
    this.deviceType = deviceConfig.type;
    this.deviceId = deviceConfig.id;

    const options = (platform.config && platform.config.options) || {};
    this.defaultFanSpeed = normalizeDefaultFanSpeed(options.defaultFanSpeed, this.deviceType);

    this.addService(Service.Switch, 'Food Dispenser');
    this.addService(Service.OccupancySensor, 'Door');
    this.addService(Service.OccupancySensor, 'Food');

    this.refreshAccessoryServiceIfNeed(this.statusArr, false);
    this.log.info(
      `Feeder ${this.deviceConfig.name} (${this.deviceType}): default fan ${this.defaultFanSpeed}% → ${amountFromFanSpeed(this.defaultFanSpeed, this.deviceType)}g`
    );
  }

  addService(serviceType, name) {
    var service = this.homebridgeAccessory.getService(name);
    if (service) {
      service.setCharacteristic(Characteristic.Name, name);
    } else {
      this.homebridgeAccessory.addService(serviceType, name, name);
    }
  }

  refreshAccessoryServiceIfNeed(statusArr, isRefresh) {
    this.isRefresh = isRefresh;

    // Bind RotationSpeed once on init (do not go through normalAsync — that would double-bind)
    if (!this.isRefresh && this.service) {
      const speedKey = this.service.displayName + '-' + Characteristic.RotationSpeed.UUID;
      this.setCachedState(speedKey, this.defaultFanSpeed);
      this.bindRotationSpeed();
      this.service.getCharacteristic(Characteristic.RotationSpeed).updateValue(this.defaultFanSpeed);
    }

    const dispenser = this.homebridgeAccessory.getService('Food Dispenser');
    if (dispenser) {
      this.normalAsync(Characteristic.On, false, dispenser);
    }

    let blk_d = null;
    for (const statusMap in statusArr) {
      let service;
      switch (statusMap) {
        case 'errorCode':
          blk_d = statusArr[statusMap] === 'blk_d' ? 1 : 0;
        case 'door':
          service = this.homebridgeAccessory.getService('Door');
          if (service) {
            this.normalAsync(Characteristic.OccupancyDetected, blk_d == 1 ? 1 : 0, service);
          }
          break;
        case 'food':
          service = this.homebridgeAccessory.getService('Food');
          if (service) {
            this.normalAsync(Characteristic.OccupancyDetected, statusArr[statusMap] ? 0 : 1, service);
          }
          break;
        default:
          break;
      }
    }
  }

  bindRotationSpeed() {
    const characteristic = this.service.getCharacteristic(Characteristic.RotationSpeed);
    characteristic.removeAllListeners('get');
    characteristic.removeAllListeners('set');
    if (usesTenGramPortions(this.deviceType)) {
      // 20% steps → 10g portions (10–50g)
      characteristic.setProps({ minValue: 0, maxValue: 100, minStep: 20 });
    } else {
      // 10% steps → 5g portions (5–50g)
      characteristic.setProps({ minValue: 0, maxValue: 100, minStep: 10 });
    }
    characteristic
      .on('get', (callback) => {
        const key = this.service.displayName + '-' + Characteristic.RotationSpeed.UUID;
        callback(null, this.hasValidCache() && this.cachedState.has(key)
          ? this.getCachedState(key)
          : this.defaultFanSpeed);
      })
      .on('set', (value, callback) => {
        const amount = amountFromFanSpeed(value, this.deviceType);
        const key = this.service.displayName + '-' + Characteristic.RotationSpeed.UUID;
        this.setCachedState(key, value);
        this.log.info(`Portion set to ${value}% → ${amount}g`);
        callback();
      });
  }

  normalAsync(name, hbValue, service = null) {
    const target = service ? service : this.service;
    const key = target.displayName + '-' + name.UUID;
    this.setCachedState(key, hbValue);
    if (this.isRefresh) {
      target.getCharacteristic(name).updateValue(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, target);
    }
  }

  getAccessoryCharacteristic(name, service = null) {
    const target = service ? service : this.service;
    const key = target.displayName + '-' + name.UUID;
    const characteristic = target.getCharacteristic(name);

    characteristic.removeAllListeners('get');
    characteristic.removeAllListeners('set');

    characteristic
      .on('get', (callback) => {
        if (this.hasValidCache() && this.cachedState.has(key)) {
          callback(null, this.getCachedState(key));
        } else {
          callback(null, false);
        }
      })
      .on('set', async (value, callback) => {
        if (name === Characteristic.On && !value) {
          this.setCachedState(key, false);
          callback();
          return;
        }

        const command = this.getSendParam(name);
        if (!command) {
          callback();
          return;
        }

        this.platform.petkitOpenApi.sendCommand(command).then(async () => {
          this.setCachedState(key, false);
          target.getCharacteristic(Characteristic.On).updateValue(false);
          try {
            const device = await this.refreshDevice();
            this.updateState(device);
          } catch (e) {
            this.log.error(`Refresh after feed failed: ${e}`);
          }
          callback();
        }).catch((error) => {
          this.log.error(`[SET][${this.homebridgeAccessory.displayName}] Characteristic Error: ${error}`);
          this.setCachedState(key, false);
          target.getCharacteristic(Characteristic.On).updateValue(false);
          this.invalidateCache();
          callback(error);
        });
      });
  }

  async refreshDevice() {
    await this.platform.petkitOpenApi.ensureSession();
    return this.platform.petkitOpenApi.getDeviceDetail(this.deviceType, this.deviceId);
  }

  getSendParam(name) {
    if (name !== Characteristic.On) {
      return null;
    }

    const speed = this.service.getCharacteristic(Characteristic.RotationSpeed).value;
    const amount = amountFromFanSpeed(speed, this.deviceType);
    const date = new Date();
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');

    this.log.info(`Dispensing ${amount}g (${speed}% fan) from ${this.deviceConfig.name}`);

    return {
      path: '/' + this.deviceType.toLowerCase() + '/saveDailyFeed',
      params: {
        amount,
        day,
        deviceId: this.deviceId,
        time: -1,
      },
    };
  }

  updateState(data) {
    if (data && data.state && Object.keys(data.state).length > 0) {
      this.refreshAccessoryServiceIfNeed(data.state, true);
    }
  }
}

module.exports = FeederAccessory;
