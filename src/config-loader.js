// src/config-loader.js - Config loader with environment variable support
const fs = require('fs');
const path = require('path');

class ConfigLoader {
    constructor() {
        this.config = null;
    }

    /**
     * Load configuration from environment variables or config.json
     */
    loadConfig() {
        // Try to load from config.json first
        const configPath = path.join(__dirname, '..', 'public', 'config.json');
        
        try {
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                this.config = JSON.parse(configData);
                console.log('✅ Config loaded from config.json');
            } else {
                console.log('⚠️  config.json not found, using environment variables');
                this.config = this.createConfigFromEnv();
            }
        } catch (error) {
            console.log('⚠️  Error loading config.json, using environment variables');
            this.config = this.createConfigFromEnv();
        }

        return this.config;
    }

    /**
     * Create config from environment variables
     */
    createConfigFromEnv() {
        const config = {
            tiktok: {
                enabled: process.env.TIKTOK_ENABLED === 'true',
                uniqueId: process.env.TIKTOK_UNIQUE_ID || 'YOUR_TIKTOK_USERNAME'
            },
            kick: {
                enabled: process.env.KICK_ENABLED === 'true',
                channelName: process.env.KICK_CHANNEL_NAME || 'YOUR_KICK_CHANNEL_NAME',
                appKey: process.env.KICK_APP_KEY || 'YOUR_KICK_APP_KEY',
                appSecret: process.env.KICK_APP_SECRET || 'YOUR_KICK_APP_SECRET'
            },
            hue: {
                enabled: process.env.HUE_ENABLED === 'true',
                hubIp: process.env.HUE_HUB_IP || 'YOUR_HUE_HUB_IP',
                username: process.env.HUE_USERNAME || 'YOUR_HUE_USERNAME',
                targetGroupId: parseInt(process.env.HUE_TARGET_GROUP_ID) || 1
            },
            fontSize: parseInt(process.env.FONT_SIZE) || 25,
            fontWeight: parseInt(process.env.FONT_WEIGHT) || 800,
            fadeIn: parseInt(process.env.FADE_IN) || 2000,
            fadeOut: parseInt(process.env.FADE_OUT) || 2000,
            fadeAfter: parseInt(process.env.FADE_AFTER) || 5000,
            textColour: process.env.TEXT_COLOUR || '#ffffff',
            nameColour: process.env.NAME_COLOUR || '#32C3A6',
            volume: parseFloat(process.env.VOLUME) || 0.1,
            enabled: {
                gift: process.env.ENABLE_GIFT !== 'false',
                subscribe: process.env.ENABLE_SUBSCRIBE !== 'false',
                follow: process.env.ENABLE_FOLLOW !== 'false'
            },
            firstFollowOnly: process.env.FIRST_FOLLOW_ONLY !== 'false',
            followerGoal: {
                goal: parseInt(process.env.FOLLOWER_GOAL) || 50,
                startingCount: parseInt(process.env.FOLLOWER_STARTING_COUNT) || 0
            },
            giftGoal: {
                goal: parseInt(process.env.GIFT_GOAL) || 1000,
                startingCount: parseInt(process.env.GIFT_STARTING_COUNT) || 0
            },
            display: {
                showPlatformIndicators: process.env.SHOW_PLATFORM_INDICATORS !== 'false',
                platformIndicatorStyle: process.env.PLATFORM_INDICATOR_STYLE || 'subtle'
            }
        };

        console.log('✅ Config created from environment variables');
        return config;
    }

    /**
     * Get config value
     */
    get(key, defaultValue = null) {
        if (!this.config) {
            this.loadConfig();
        }
        
        const keys = key.split('.');
        let value = this.config;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Get entire config
     */
    getAll() {
        if (!this.config) {
            this.loadConfig();
        }
        return this.config;
    }
}

module.exports = ConfigLoader;
