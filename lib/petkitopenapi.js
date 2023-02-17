const axios = require('axios').default;
const crypto = require('crypto-js');
const qs = require('qs');
const uuid = require('uuid');
const CountryUtil = require('../util/countryutil')

class PetkitOpenAPI {

  constructor(username, password, countryCode, log) {
    this.username = username;
    this.password = password;
    this.countryCode = countryCode;
    this.endpoint = (this.countryCode)? new CountryUtil().getEndPointWithCountryCode(this.countryCode) : "http://api.petkt.com/latest"
    this.log = log;

    this.tokenInfo = {
      createdAt: '',
      expiresIn: 0,
      id: '',
      region: '',
      userId: '',
    }
  }

  async _refreshAccessTokenIfNeed(path) {
    if (this.isLogin() == false) {
      return;
    }

    if (path.startsWith('/user/refreshsession')) {
      return;
    }

    if (((this.tokenInfo.expiresIn - 60) * 1000) + Date.parse(this.tokenInfo.createdAt) > new Date().getTime()) {
      return;
    }

    this.tokenInfo.id = '';
    let res = await this.post('/user/refreshsession');
    let {createdAt, expiresIn, id, region, userId} = res.result.session;
    this.tokenInfo = {
      createdAt: createdAt,
      expiresIn: expiresIn,
      id: id,
      region: region,
      userId: userId,
    };

    return;
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
    return this.tokenInfo && this.tokenInfo.id.count > 0;
  }

  //Get all devices
  async getDeviceList() {
    let assets = await this.get_assets();

    let devices = [];
    for (const asset of assets) {
      let res = await this.getDeviceDetail(asset.type, asset.data.id);
      devices.push(Object.assign(res, {'id': asset.data.id.toString(), 'type': asset.type}));              
    }

    return devices;
  }

  // Gets a list of human-actionable assets
  async get_assets() {
    let res = await this.post('/discovery/device_roster');
    return res.result.devices;
  }

  // Gets the individual device detail
  async getDeviceDetail(deviceType, deviceID) {
    let res = await this.post(`/${deviceType.toLowerCase()}/device_detail`, {'id': deviceID});
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
      'X-Client': 'ios(15.5;iPhone12,3)',
      'Accept': '*/*',
      'X-Timezone': '2.0',
      'Accept-Language': 'es-ES;q=1',
      'Accept-Encoding': 'gzip, deflate',
      'X-Api-Version': '8.17.1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PETKIT/8.17.1 (iPhone; iOS 15.5; Scale/3.00)',
      'X-TimezoneId': 'Europe/Madrid',
      'X-Locale': 'es_ES',
      'X-Session' : access_token,
    };

    this.log.log(`PetkitOpenAPI request: method = ${method}, endpoint = ${this.endpoint}, path = ${path}, params = ${JSON.stringify(params)}, body = ${JSON.stringify(body)}, headers = ${JSON.stringify(headers)}`);

    let res = await axios({
      baseURL: this.endpoint,
      url: path,
      method: method,
      headers: headers,
      params: qs.stringify(params),
      data: qs.stringify(body),
    });

    this.log.log(`PetkitOpenAPI response: ${JSON.stringify(res.data)} path = ${path}`);
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
