class LogUtil {
    constructor(homebridgeLog, isDebug = false) {
        this.hbLog = homebridgeLog;
        this.isDebug = !!isDebug;
    }

    // Always visible in Homebridge logs
    info(...args) {
        if (this.hbLog) {
            this.hbLog.info(...args);
        } else {
            console.log(...args);
        }
    }

    // Only when options.debug is true
    log(...args) {
        if (!this.isDebug) {
            return;
        }
        if (this.hbLog) {
            this.hbLog.info(...args);
        } else {
            console.log(...args);
        }
    }

    error(...args) {
        if (this.hbLog) {
            this.hbLog.error(...args);
        } else {
            console.error(...args);
        }
    }
}

module.exports = LogUtil;
