/**
 * Wrapper for client-side TikTok connection over Socket.IO
 * With reconnect functionality.
 */
class TikTokIOConnection {
    constructor(backendUrl) {
        this.socket = io(backendUrl);
        this.uniqueId = null;
        this.options = null;

        this.socket.on('connect', () => {
            Logger.DEBUG("Socket connected!");

            // Reconnect to streamer if uniqueId already set
            if (this.uniqueId) {
                this.setUniqueId();
            }
        })

        this.socket.on('disconnect', () => {
            Logger.DEBUG("Socket disconnected!");
        })

        this.socket.on('streamEnd', () => {
            Logger.DEBUG("LIVE has ended!");
            this.uniqueId = null;
        })

        this.socket.on('tiktokDisconnected', (errMsg) => {
            Logger.WARNING(errMsg);
            if (errMsg && errMsg.includes('LIVE has ended')) {
                this.uniqueId = null;
                this.socket.emit('streamEnd');
            }
        });
    }

    connect(uniqueId, options) {
        this.uniqueId = uniqueId;
        this.options = options || {};

        this.setUniqueId();

        return new Promise((resolve, reject) => {
            this.socket.once('tiktokConnected', resolve);
            this.socket.once('tiktokDisconnected', reject);

            setTimeout(() => {
                reject('Connection Timeout');
            }, 15000)
        })
    }

    setUniqueId() {
        this.socket.emit('setUniqueId', this.uniqueId, this.options);
    }

    on(eventName, eventHandler) {
        this.socket.on(eventName, eventHandler);
    }
}


let connection = new TikTokIOConnection();

// Initialize Hue client for local network access
let hueClient = null;


let Config = {
    firstConnect: true,
    retryCount: 0,
    maxRetries: 10, // Set this to -1 for infinite retries

    updateConfig() {
        fetch("/config.json").then((response) => response.json()).then((json) => {
            Config = Object.assign({}, Config, json);

            // Initialize Hue client if enabled
            if (Config.hue?.enabled && !hueClient) {
                // Load Hue client script dynamically
                if (typeof HueClient === 'undefined') {
                    const script = document.createElement('script');
                    script.src = '/hue-client.js';
                    script.onload = () => {
                        hueClient = new HueClient(Config);
                        setupHueEventHandlers();
                    };
                    document.head.appendChild(script);
                } else {
                    hueClient = new HueClient(Config);
                    setupHueEventHandlers();
                }
            }

            if (this.firstConnect || this.retryCount > 0) {
                this.connectWithRetry();
            }

            setTimeout(Config.updateConfig, 1000);
        });
    },

    connectWithRetry() {
        // Use the new nested TikTok config structure
        const tiktokUniqueId = Config.tiktok?.uniqueId || Config["uniqueId"];
        Logger.INFO("Connecting to %s... (Attempt %d)", tiktokUniqueId, this.retryCount + 1);
        connection.connect(tiktokUniqueId, {enableExtendedGiftInfo: true})
            .then(state => {
                Logger.INFO("Connected to roomId %s", state["roomId"]);
                this.firstConnect = false;
                this.retryCount = 0;
            })
            .catch(errorMessage => {
                Logger.ERROR("Failed to connect: \n\n %s", errorMessage);
                this.retryCount++;
                
                if (this.maxRetries === -1 || this.retryCount < this.maxRetries) {
                    Logger.INFO("Retrying in 60 seconds...");
                    setTimeout(() => this.connectWithRetry(), 60000); // Retry after 1 minute
                } else {
                    Logger.ERROR("Max retries reached. Stopping connection attempts.");
                    this.firstConnect = true; // Reset for future attempts
                    this.retryCount = 0;
                }
            });
    }
};

Config.updateConfig();

class Announcement {
    #uniqueId;
    #imageUrl;
    #message;
    #soundUrl;
    #circleCrop;
    #type;
    static #queue = [];
    static #isProcessing = false;

    constructor(uniqueId, imageUrl, message, soundUrl, circleCrop = false, type = null) {
        this.#uniqueId = uniqueId;
        this.#imageUrl = imageUrl;
        this.#message = message;
        this.#soundUrl = soundUrl;
        this.#circleCrop = circleCrop;
        this.#type = type;
    }

    static #getAnimatedLetters(name, _html = "") {
        for (let letter of name.split("")) {
            _html += `<span class="animated-letter wiggle" style="color: ${Config["nameColour"]}; white-space: nowrap;">${letter}</span>`
        }
        return _html;
    }

    static #cleanUniqueId(uniqueId) {
        let chars = [...uniqueId];
        let result = [];
        
        for (let i = 0; i < chars.length; i++) {
            // Only skip if the current character is the same as the previous one
            if (i > 0 && chars[i] === chars[i - 1]) {
                continue;
            }
            result.push(chars[i]);
        }
        
        return result.join('');
    }

    static #processQueue() {
        if (this.#isProcessing || this.#queue.length === 0) {
            return;
        }

        this.#isProcessing = true;
        const announcement = this.#queue.shift();

        // Emit light event based on announcement type
        if (announcement.#type) {
            connection.socket.emit(announcement.#type + 'Lights');
        }

        $(".current").replaceWith(announcement.build());
        announcement.sound();

        // Calculate total animation duration
        const fadeIn = Config["fadeIn"] || 0;
        const fadeAfter = Config["fadeAfter"] || 0;
        const fadeOut = Config["fadeOut"] || 0;
        const totalDuration = fadeIn + fadeAfter + fadeOut;
        // Process next announcement after current one finishes
        setTimeout(() => {
            this.#isProcessing = false;
            this.#processQueue();
        }, totalDuration);
    }

    static addToQueue(announcement) {
        this.#queue.push(announcement);
        this.#processQueue();
    }

    build() {
        const cleanedId = Announcement.#cleanUniqueId(this.#uniqueId);
        const borderRadius = this.#circleCrop ? '50%' : '8px';
        return `
             <div class="alertContainer current" style="
                animation: fadein ${Config["fadeIn"] || 0}ms, fadeout ${Config["fadeOut"] || 0}ms; 
                animation-delay: 0ms, ${Config["fadeAfter"]}ms;
                animation-fill-mode: forwards;
                font-size: ${Config["fontSize"] + "px"};
                background-color: rgba(20, 20, 20, 0.7);
                border-radius: 12px;
                padding: 15px;
                padding-left: 35px;
                display: grid;
                grid-template-columns: auto 1fr;
                width: 400px;
                align-items: center;
            ">
                <img class="alertImage" src="${this.#imageUrl}" alt="Image" style="
                    width: 70px;
                    height: 70px;
                    object-fit: cover;
                    border-radius: ${borderRadius};
                    grid-row: span 2;
                    margin-left: 10px;
                "/>
                <div class="alertText" style="
                    font-weight: bold;
                    color: #FFFFFF;
                    font-size: ${Config["fontSize"] + "px"};
                    line-height: 1;
                    margin: 0;
                    vertical-align: bottom;
                ">
                    ${cleanedId}
                </div>
                <div class="alertText" style="
                    color: rgba(255, 255, 255, 0.9);
                    font-size: ${Config["fontSize"] + "px"};
                    line-height: 1;
                    margin: 0;
                    vertical-align: top;
                ">
                    ${this.#message}
                </div>
            </div>
        `
    }

    sound() {
        if (!this.#soundUrl) {
            return;
        }

        let file, volume;
        if (typeof this.#soundUrl === 'object' && this.#soundUrl !== null) {
            file = this.#soundUrl.file;
            volume = typeof this.#soundUrl.volume === 'number' ? this.#soundUrl.volume : Config["volume"];
        } else {
            file = this.#soundUrl;
            volume = Config["volume"];
        }

        if (!file) return;
        let audio = new Audio(file);
        audio.volume = volume;
        audio.play().catch(() => {});
    }
}


connection.on('gift', (data) => {
    if (!Config["enabled"]["gift"]) {
        return;
    }

    if (data["giftType"] === 1 && !data["repeatEnd"]) {
        return;
    }

    let announcement = new Announcement(
        data["nickname"],
        data["giftPictureUrl"],
        `sent ${data["repeatCount"]}x ${data["giftName"]}`,
        Config["sounds"]["gift"][data["giftName"].toLowerCase()] || Config["sounds"]["gift"]["default"],
        false,
        'gift'
    );

    Announcement.addToQueue(announcement);
});


const followed = {}


connection.on("social", (data) => {

    if (!Config["enabled"]["follow"]) {
        return;
    }

    if (!data["displayType"].includes("follow")) {
        return;
    }

    if (followed[data["uniqueId"]] && Config["firstFollowOnly"]) {
        return;
    }

    followed[data["uniqueId"]] = true;

    let followSounds = Config["sounds"]["follow"];
    let followSoundObj = Array.isArray(followSounds) ? followSounds[Math.floor(Math.random() * followSounds.length)] : followSounds;
    let announcement = new Announcement(
        data["nickname"] != "" ? data["nickname"] : data["uniqueId"],
        '/images/raccoon.GIF',
        `is now following!`,
        followSoundObj,
        true,
        'newFollower'
    );

    Announcement.addToQueue(announcement);

    // Emit a custom event for new follower
    connection.socket.emit('newFollower', { uniqueId: data["uniqueId"] });

})

connection.on("subscribe", (data) => {

    if (!Config["enabled"]["subscribe"]) {
        return;
    }

    let subscribeSound = Config["sounds"]["subscribe"];
    let announcement = new Announcement(
        data["nickname"] != "" ? data["nickname"] : data["uniqueId"],
        data["profilePictureUrl"],
        `just subscribed!`,
        subscribeSound || null,
        true,
        'subscribe'
    )

    Announcement.addToQueue(announcement);

})

// Hue event handlers for local network access
function setupHueEventHandlers() {
    if (!hueClient) return;

    // Listen for Hue triggers from server
    connection.socket.on('hueTrigger', (trigger) => {
        console.log('💡 Received Hue trigger from server:', trigger);
        hueClient.handleHueTrigger(trigger);
    });

    // Light effect triggers
    connection.socket.on('subscribeLights', () => {
        if (hueClient && Config.hue?.enabled) {
            hueClient.pulseGroupLights(Config.hue.targetGroupId, {
                duration: 150,
                count: 10,
                color: [0.67, 0.33],
                brightnessIncrease: 200,
                transitionTime: 10
            });
        }
    });

    connection.socket.on('newFollowerLights', () => {
        if (hueClient && Config.hue?.enabled) {
            hueClient.pulseGroupLights(Config.hue.targetGroupId, {
                duration: 100,
                count: 4,
                color: [0.45, 0.41], // Warm white
                brightnessIncrease: 100,
                transitionTime: 10
            });
        }
    });

    connection.socket.on('giftLights', () => {
        if (hueClient && Config.hue?.enabled) {
            hueClient.pulseGroupLights(Config.hue.targetGroupId, {
                duration: 100,
                count: 3,
                color: [0.55, 0.45],
                brightnessIncrease: 100,
                transitionTime: 10
            });
        }
    });

    console.log('💡 Hue event handlers set up successfully');
}
