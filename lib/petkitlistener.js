const POLL_INTERVAL_MS = 5 * 60 * 1000; // refresh device state every 5 minutes

class PetkitListener {

  constructor(api, log) {
    this.api = api;
    this.log = log;
    this.message_listeners = null;
    this.addListener = () => {};
  }

  start() {
    this.running = true;
    this._loop_start();
  }

  stop() {
    this.running = false;
  }

  async _loop_start() {
    // Initial poll already happened during platform init; wait before first refresh
    while (this.running) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (!this.running) {
        break;
      }

      try {
        await this.api.ensureSession();
        const devices = await this.api.getDeviceList();
        if (!Array.isArray(devices)) {
          this.log.error('Device poll returned a non-array result; skipping accessory sync.');
          continue;
        }
        this.addMessageListener(devices);
      } catch (e) {
        // Never tear down accessories on a failed poll — that drops them from HomeKit scenes
        this.log.error(`Device poll failed (accessories left unchanged): ${e && e.message ? e.message : e}`);
      }
    }
  }

  addMessageListener(message) {
    this.message_listeners = message;
    this.addListener(message);
  }

  registerListener(listener) {
    this.addListener = listener;
  }
}

module.exports = PetkitListener;
