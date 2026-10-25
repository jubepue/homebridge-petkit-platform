const axios = require('axios').default;
const crypto = require('crypto-js');
const qs = require('qs');
const CountryUtil = require('../util/countryutil')

class PetkitOpenAPI {

  constructor(username, password, countryCode, log) {
    this.username = username;
    this.password = password;
    this.countryCode = countryCode;
    this.endpoint = (this.countryCode)
      ? new CountryUtil().getEndPointWithCountryCode(this.countryCode)
      : CountryUtil.defaultEndPoint;
    this.log = log;

    this.tokenInfo = {
      createdAt: '',
      expiresIn: 0,
      id: '',
      region: '',
      userId: '',
    }
  }

  // Petkit returns expiresIn in seconds (e.g. 1440 ≈ 24 minutes).
  // https://documenter.getpostman.com/view/3161327/TzshHQeK
  tokenExpiresAtMs() {
    if (!this.tokenInfo || !this.tokenInfo.createdAt || !this.tokenInfo.expiresIn) {
      return 0;
    }
    const created = Date.parse(this.tokenInfo.createdAt);
    if (isNaN(created)) {
      return 0;
    }
    return created + (this.tokenInfo.expiresIn * 1000);
  }

  isTokenFresh(skewMs = 5 * 60 * 1000) {
    return this.isLogin() && this.tokenExpiresAtMs() - skewMs > Date.now();
  }

  clearSession() {
    this.tokenInfo = {
      createdAt: '',
      expiresIn: 0,
      id: '',
      region: '',
      userId: '',
    };
  }

  async refreshSession() {
    // Keep current token in headers while refreshing
    let res = await this.post('/user/refreshsession');
    if (res.error || !res.result || !res.result.session) {
      throw new Error(res.error ? `${res.error.code}: ${res.error.msg}` : 'No session in refresh response');
    }
    let {createdAt, expiresIn, id, region, userId} = res.result.session;
    this.tokenInfo = {
      createdAt: createdAt,
      expiresIn: expiresIn,
      id: id,
      region: region,
      userId: userId,
    };
    return this.tokenInfo;
  }

  async _refreshAccessTokenIfNeed(path) {
    if (!this.isLogin()) {
      return;
    }

    if (path.startsWith('/user/login') || path.startsWith('/user/refreshsession')) {
      return;
    }

    if (this.isTokenFresh()) {
      return;
    }

    try {
      await this.refreshSession();
    } catch (e) {
      this.log.log(`Session refresh failed, re-logging in: ${e && e.message ? e.message : e}`);
      this.clearSession();
      await this.login(this.username, this.password);
    }
  }

  async ensureSession() {
    if (this.isTokenFresh()) {
      return this.tokenInfo;
    }
    if (this.isLogin()) {
      try {
        await this.refreshSession();
        if (this.isTokenFresh()) {
          return this.tokenInfo;
        }
      } catch (e) {
        this.log.log(`Session refresh failed, re-logging in: ${e && e.message ? e.message : e}`);
        this.clearSession();
      }
    }
    return this.login(this.username, this.password);
  }

  async login(username, password) {
    let res = await this.post('/user/login', {
      'username': username,
      'password': crypto.MD5(crypto.enc.Utf8.parse(password)).toString(),
      'encrypt': '1',
      'timezoneId': 'Europe/Madrid',
      'timezone': '2.0',
      'locale': 'es_ES'
    });
    if (res.error) {
      throw new Error(`Petkit login error ${res.error.code}: ${res.error.msg}`);
    }
    let {createdAt, expiresIn, id, region, userId} = res.result.session;

    this.tokenInfo = {
      createdAt: createdAt,
      expiresIn: expiresIn,
      id: id,
      region: region,
      userId: userId,
    };

    return res.result.session;
  }

  isLogin() {
    return this.tokenInfo && this.tokenInfo.id && this.tokenInfo.id.length > 0;
  }

  //Get all devices
  async getDeviceList() {
    let assets = await this.get_assets();

    let devices = [];
    for (const asset of assets) {
      try {
        let res = await this.getDeviceDetail(asset.type, asset.data.id);
        devices.push(Object.assign(res || {}, {
          'id': asset.data.id.toString(),
          'type': asset.type,
          'name': asset.name || (res && res.name),
        }));
      } catch (e) {
        // Skip rather than inventing empty state — that would wipe sensor readings on refresh
        this.log.error(`Failed to load detail for ${asset.type}/${asset.data.id}: ${e && e.message ? e.message : e}`);
      }
    }

    return devices;
  }

  // Normalize Petkit device type strings to the casing this plugin expects
  normalizeDeviceType(type) {
    if (!type) {
      return type;
    }
    const map = {
      feeder: 'Feeder',
      feedermini: 'FeederMini',
      d3: 'D3',
      d4: 'D4',
      d4s: 'D4s',
      d4h: 'D4H',
      d4sh: 'D4SH',
    };
    const key = String(type).toLowerCase();
    return map[key] || type;
  }

  todayYyyymmdd() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  // Gets a list of human-actionable assets via family list (+ shared roster fallback)
  async get_assets() {
    let familiesRes = await this.get('/group/family/list');
    if (familiesRes && familiesRes.error) {
      // Some regions still accept POST for this endpoint
      familiesRes = await this.post('/group/family/list', {});
    }
    if (familiesRes && familiesRes.error) {
      throw new Error(`Petkit family list error ${familiesRes.error.code}: ${familiesRes.error.msg}`);
    }

    const families = Array.isArray(familiesRes.result)
      ? familiesRes.result
      : (Array.isArray(familiesRes) ? familiesRes : []);

    this.log.info(`Found ${families.length} Petkit family/group(s).`);

    const assets = [];
    const seen = new Set();

    for (const family of families) {
      const groupId = family.groupId;
      let deviceList = Array.isArray(family.deviceList) ? family.deviceList : [];

      if (deviceList.length === 0 && groupId != null) {
        deviceList = await this.getSharedDevicesForGroup(groupId);
      }

      for (const device of deviceList) {
        const rawType = device.deviceType || device.type;
        const id = device.deviceId != null ? device.deviceId : device.id;
        if (id == null || !rawType) {
          continue;
        }
        const type = this.normalizeDeviceType(rawType);
        const key = `${type}:${id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        assets.push({
          type,
          name: device.deviceName || device.name,
          data: { id },
          groupId,
        });
      }
    }

    return assets;
  }

  async getSharedDevicesForGroup(groupId) {
    const res = await this.post('/discovery/device_roster_v2', {
      day: this.todayYyyymmdd(),
      groupId,
    });
    if (res && res.error) {
      this.log.error(`Petkit roster_v2 error for group ${groupId}: ${res.error.code} ${res.error.msg}`);
      return [];
    }
    const devices = (res.result && res.result.devices) || res.devices || [];
    return Array.isArray(devices) ? devices : [];
  }

  // Gets the individual device detail
  async getDeviceDetail(deviceType, deviceID) {
    let res = await this.post(`/${deviceType.toLowerCase()}/device_detail`, {'id': deviceID});
    if (res && res.error) {
      throw new Error(`Petkit device_detail error ${res.error.code}: ${res.error.msg}`);
    }
    return res.result;
  }

  async sendCommand(command) {
    if (command) {
      let res = await this.post(command.path, command.params);
      return res.result;
    }
  }

  async request(method, path, params = null, body = null) {
    await this._refreshAccessTokenIfNeed(path);

    let access_token = this.tokenInfo.id || '';
    let headers = {
      'X-Client': 'ios(15.1;iPhone14,3)',
      'Accept': '*/*',
      'X-Timezone': '2.0',
      'Accept-Language': 'es-ES;q=1',
      'Accept-Encoding': 'gzip, deflate',
      'X-Api-Version': '11.2.1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PETKIT/11.2.1 (iPhone; iOS 15.5; Scale/3.00)',
      'X-TimezoneId': 'Europe/Madrid',
      'X-Locale': 'es_ES',
      'X-Session' : access_token,
      'F-Session': access_token,
    };

    // Avoid dumping secrets into Homebridge logs
    const safeBody = body && typeof body === 'object'
      ? Object.assign({}, body, body.password ? { password: '***' } : {})
      : body;
    const safeHeaders = Object.assign({}, headers, {
      'X-Session': access_token ? '***' : '',
      'F-Session': access_token ? '***' : '',
    });
    this.log.log(`PetkitOpenAPI request: method = ${method}, endpoint = ${this.endpoint}, path = ${path}, params = ${JSON.stringify(params)}, body = ${JSON.stringify(safeBody)}, headers = ${JSON.stringify(safeHeaders)}`);

    let res = await axios({
      baseURL: this.endpoint.replace(/\/$/, ''),
      url: path,
      method: method,
      headers: headers,
      params: params || undefined,
      data: body ? qs.stringify(body) : undefined,
      // Petkit returns business errors as HTTP 404 with JSON body (e.g. outdated app)
      validateStatus: (status) => status >= 200 && status < 500,
    });

    this.log.log(`PetkitOpenAPI response: status = ${res.status}, data = ${JSON.stringify(res.data)} path = ${path}`);

    if (res.status >= 400 && (!res.data || !res.data.error)) {
      throw new Error(`Request failed with status code ${res.status}`);
    }

    return res.data;
  }

  async get(path, params) {
    return this.request('get', path, params, null);
  }

  async post(path, params) {
    return this.request('post', path, null, params);
  }

}

module.exports = PetkitOpenAPI;
