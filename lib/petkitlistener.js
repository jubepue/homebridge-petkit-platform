const uuid = require('uuid');

class PetkitListener {

  constructor(api, log) {
    this.api = api;
    this.log = log;
    this.message_listeners = null;
  }

  start() {
    this.running = true;
    this._loop_start();
  }

  stop() {
    this.running = false;
  }

  async _loop_start() {
    let devices;
    while (this.running) {
      await this.api.login(this.api.username, this.api.password);
      devices = await this.api.getDeviceList();
      this.addMessageListener(devices);
      await new Promise(r => setTimeout(r, (this.api.tokenInfo.expiresIn - 60) * 1000));
    }
  }

  addListener(message) {}

  addMessageListener(message) {
    this.message_listeners = message;
    this.addListener(message);
  }

  registerListener(listener) {
    this.addListener = listener;
  }

}

module.exports = PetkitListener;
