// modules/configStore.js - Live view of public/config.json
//
// Most of the server reads config.json once at startup. Settings that should apply
// mid-stream (currently the Hue light effects) read `getConfigStore().current` at the
// moment they are used, and the store re-reads the file whenever it changes on disk.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'public', 'config.json');

class ConfigStore extends EventEmitter {
    constructor(filePath) {
        super();
        this.filePath = filePath;
        this.current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.watching = false;
    }

    /**
     * Re-read the file. If it can't be parsed (e.g. saved halfway through a manual edit),
     * the previous settings are kept.
     * @returns {boolean} whether new settings were loaded
     */
    reload() {
        let next;
        try {
            next = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (err) {
            console.warn(`[config] ${path.basename(this.filePath)} changed but could not be read (${err.message}); keeping previous settings.`);
            return false;
        }
        this.current = next;
        this.emit('change', next);
        return true;
    }

    /** Poll the file for changes. Polling (rather than fs.watch) also survives atomic saves. */
    watch(intervalMs = 1000) {
        if (this.watching) return;
        this.watching = true;
        fs.watchFile(this.filePath, { interval: intervalMs, persistent: false }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
                if (this.reload()) {
                    console.log('[config] Reloaded config.json');
                }
            }
        });
    }

    unwatch() {
        fs.unwatchFile(this.filePath);
        this.watching = false;
    }
}

let instance = null;

/**
 * Shared store for the active config file. The path can be overridden with
 * TIKTOK_WIDGETS_CONFIG (used by tests).
 */
function getConfigStore() {
    if (!instance) {
        instance = new ConfigStore(process.env.TIKTOK_WIDGETS_CONFIG || DEFAULT_CONFIG_PATH);
    }
    return instance;
}

module.exports = { ConfigStore, getConfigStore, DEFAULT_CONFIG_PATH };
