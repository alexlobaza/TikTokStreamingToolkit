#!/usr/bin/env node
// scripts/build-config.js - Build config.json from environment variables
const fs = require('fs');
const path = require('path');

console.log('🔧 Building config.json from environment variables...');

// Read the sample config
const samplePath = path.join(__dirname, '..', 'public', 'config.json.sample');
const outputPath = path.join(__dirname, '..', 'public', 'config.json');

try {
    const sampleConfig = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    
    // Replace values with environment variables
    const config = {
        tiktok: {
            enabled: process.env.TIKTOK_ENABLED === 'true' || sampleConfig.tiktok?.enabled || false,
            uniqueId: process.env.TIKTOK_UNIQUE_ID || sampleConfig.tiktok?.uniqueId || 'YOUR_TIKTOK_USERNAME'
        },
        kick: {
            enabled: process.env.KICK_ENABLED === 'true' || sampleConfig.kick?.enabled || false,
            channelName: process.env.KICK_CHANNEL_NAME || sampleConfig.kick?.channelName || 'YOUR_KICK_CHANNEL_NAME',
            appKey: process.env.KICK_APP_KEY || sampleConfig.kick?.appKey || 'YOUR_KICK_APP_KEY',
            appSecret: process.env.KICK_APP_SECRET || sampleConfig.kick?.appSecret || 'YOUR_KICK_APP_SECRET'
        },
        hue: {
            enabled: process.env.HUE_ENABLED === 'true' || sampleConfig.hue?.enabled || false,
            hubIp: process.env.HUE_HUB_IP || sampleConfig.hue?.hubIp || 'YOUR_HUE_HUB_IP',
            username: process.env.HUE_USERNAME || sampleConfig.hue?.username || 'YOUR_HUE_USERNAME',
            clientkey: process.env.HUE_CLIENT_KEY || sampleConfig.hue?.clientkey || 'YOUR_HUE_CLIENT_KEY',
            appName: process.env.HUE_APP_NAME || sampleConfig.hue?.appName || 'TikTokWidgets',
            instanceName: process.env.HUE_INSTANCE_NAME || sampleConfig.hue?.instanceName || 'TikTokWidgets',
            targetGroupId: parseInt(process.env.HUE_TARGET_GROUP_ID) || sampleConfig.hue?.targetGroupId || 1
        },
        fontSize: parseInt(process.env.FONT_SIZE) || sampleConfig.fontSize || 25,
        fontWeight: parseInt(process.env.FONT_WEIGHT) || sampleConfig.fontWeight || 800,
        fadeIn: parseInt(process.env.FADE_IN) || sampleConfig.fadeIn || 2000,
        fadeOut: parseInt(process.env.FADE_OUT) || sampleConfig.fadeOut || 2000,
        fadeAfter: parseInt(process.env.FADE_AFTER) || sampleConfig.fadeAfter || 5000,
        textColour: process.env.TEXT_COLOUR || sampleConfig.textColour || '#ffffff',
        nameColour: process.env.NAME_COLOUR || sampleConfig.nameColour || '#32C3A6',
        volume: parseFloat(process.env.VOLUME) || sampleConfig.volume || 0.1,
        enabled: {
            gift: process.env.ENABLE_GIFT !== 'false' && (sampleConfig.enabled?.gift !== false),
            subscribe: process.env.ENABLE_SUBSCRIBE !== 'false' && (sampleConfig.enabled?.subscribe !== false),
            follow: process.env.ENABLE_FOLLOW !== 'false' && (sampleConfig.enabled?.follow !== false)
        },
        firstFollowOnly: process.env.FIRST_FOLLOW_ONLY !== 'false' && (sampleConfig.firstFollowOnly !== false),
        followerGoal: {
            goal: parseInt(process.env.FOLLOWER_GOAL) || sampleConfig.followerGoal?.goal || 50,
            startingCount: parseInt(process.env.FOLLOWER_STARTING_COUNT) || sampleConfig.followerGoal?.startingCount || 0
        },
        giftGoal: {
            goal: parseInt(process.env.GIFT_GOAL) || sampleConfig.giftGoal?.goal || 1000,
            startingCount: parseInt(process.env.GIFT_STARTING_COUNT) || sampleConfig.giftGoal?.startingCount || 0
        },
        gifterRank: {
            showTotals: process.env.GIFTER_RANK_SHOW_TOTALS !== 'false' && (sampleConfig.gifterRank?.showTotals !== false),
            textColour: process.env.GIFTER_RANK_TEXT_COLOUR || sampleConfig.gifterRank?.textColour || '#ffffff',
            accentColour: process.env.GIFTER_RANK_ACCENT_COLOUR || sampleConfig.gifterRank?.accentColour || '#e3fc02',
            excludeUsers: process.env.GIFTER_RANK_EXCLUDE_USERS ? process.env.GIFTER_RANK_EXCLUDE_USERS.split(',') : (sampleConfig.gifterRank?.excludeUsers || [])
        },
        likeRank: {
            showTotals: process.env.LIKE_RANK_SHOW_TOTALS !== 'false' && (sampleConfig.likeRank?.showTotals !== false),
            textColour: process.env.LIKE_RANK_TEXT_COLOUR || sampleConfig.likeRank?.textColour || '#ffffff',
            accentColour: process.env.LIKE_RANK_ACCENT_COLOUR || sampleConfig.likeRank?.accentColour || '#e3fc02',
            excludeUsers: process.env.LIKE_RANK_EXCLUDE_USERS ? process.env.LIKE_RANK_EXCLUDE_USERS.split(',') : (sampleConfig.likeRank?.excludeUsers || [])
        },
        imageSlider: {
            disappearTime: parseInt(process.env.IMAGE_SLIDER_DISAPPEAR_TIME) || sampleConfig.imageSlider?.disappearTime || 5,
            images: process.env.IMAGE_SLIDER_IMAGES ? JSON.parse(process.env.IMAGE_SLIDER_IMAGES) : (sampleConfig.imageSlider?.images || [])
        },
        textScroller: {
            speed: parseInt(process.env.TEXT_SCROLLER_SPEED) || sampleConfig.textScroller?.speed || 2,
            pauseBetweenMessages: parseInt(process.env.TEXT_SCROLLER_PAUSE) || sampleConfig.textScroller?.pauseBetweenMessages || 1,
            messagesJsonURL: process.env.TEXT_SCROLLER_MESSAGES_URL || sampleConfig.textScroller?.messagesJsonURL || 'YOUR_MESSAGES_JSON_URL',
            accessKey: process.env.TEXT_SCROLLER_ACCESS_KEY || sampleConfig.textScroller?.accessKey || 'YOUR_ACCESS_KEY',
            masterKey: process.env.TEXT_SCROLLER_MASTER_KEY || sampleConfig.textScroller?.masterKey || 'YOUR_MASTER_KEY',
            jsonRefreshIntervalMs: process.env.TEXT_SCROLLER_REFRESH_INTERVAL || sampleConfig.textScroller?.jsonRefreshIntervalMs || '180000',
            textColor: process.env.TEXT_SCROLLER_TEXT_COLOR || sampleConfig.textScroller?.textColor || '#ffffff',
            pixelOffColor: process.env.TEXT_SCROLLER_PIXEL_OFF_COLOR || sampleConfig.textScroller?.pixelOffColor || '#222'
        },
        apiCalls: {
            apiUrl: process.env.API_URL || sampleConfig.apiCalls?.apiUrl || 'YOUR_API_URL',
            startStream: {
                enabled: process.env.API_START_STREAM_ENABLED === 'true' || sampleConfig.apiCalls?.startStream?.enabled || false,
                endpoint: process.env.API_START_STREAM_ENDPOINT || sampleConfig.apiCalls?.startStream?.endpoint || 'YOUR_START_STREAM_ENDPOINT'
            },
            endStream: {
                enabled: process.env.API_END_STREAM_ENABLED === 'true' || sampleConfig.apiCalls?.endStream?.enabled || false,
                endpoint: process.env.API_END_STREAM_ENDPOINT || sampleConfig.apiCalls?.endStream?.endpoint || 'YOUR_END_STREAM_ENDPOINT'
            },
            storeLogOffsite: {
                enabled: process.env.API_STORE_LOG_ENABLED === 'true' || sampleConfig.apiCalls?.storeLogOffsite?.enabled || false,
                endpoint: process.env.API_STORE_LOG_ENDPOINT || sampleConfig.apiCalls?.storeLogOffsite?.endpoint || 'YOUR_STORE_LOG_ENDPOINT'
            }
        },
        comments: {
            enabled: process.env.COMMENTS_ENABLED === 'true' || sampleConfig.comments?.enabled || false,
            maxCommentsStored: parseInt(process.env.COMMENTS_MAX_STORED) || sampleConfig.comments?.maxCommentsStored || 100000,
            excludeUsers: process.env.COMMENTS_EXCLUDE_USERS ? process.env.COMMENTS_EXCLUDE_USERS.split(',') : (sampleConfig.comments?.excludeUsers || []),
            autoRefreshInterval: parseInt(process.env.COMMENTS_REFRESH_INTERVAL) || sampleConfig.comments?.autoRefreshInterval || 5,
            defaultView: process.env.COMMENTS_DEFAULT_VIEW || sampleConfig.comments?.defaultView || 'all'
        },
        display: {
            showPlatformIndicators: process.env.SHOW_PLATFORM_INDICATORS !== 'false' && (sampleConfig.display?.showPlatformIndicators !== false),
            platformIndicatorStyle: process.env.PLATFORM_INDICATOR_STYLE || sampleConfig.display?.platformIndicatorStyle || 'subtle'
        },
        sounds: {
            gift: {
                default: {
                    file: process.env.SOUNDS_GIFT_DEFAULT_FILE || sampleConfig.sounds?.gift?.default?.file || '/sounds/fc25_gift.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_DEFAULT_VOLUME) || sampleConfig.sounds?.gift?.default?.volume || 0.1
                },
                "you're awesome": {
                    file: process.env.SOUNDS_GIFT_YOURE_AWESOME_FILE || sampleConfig.sounds?.gift?.["you're awesome"]?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_YOURE_AWESOME_VOLUME) || sampleConfig.sounds?.gift?.["you're awesome"]?.volume || 0.1
                },
                "10/10": {
                    file: process.env.SOUNDS_GIFT_10_10_FILE || sampleConfig.sounds?.gift?.["10/10"]?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_10_10_VOLUME) || sampleConfig.sounds?.gift?.["10/10"]?.volume || 0.1
                },
                "rosa": {
                    file: process.env.SOUNDS_GIFT_ROSA_FILE || sampleConfig.sounds?.gift?.rosa?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_ROSA_VOLUME) || sampleConfig.sounds?.gift?.rosa?.volume || 0.1
                },
                "gold boxing gloves": {
                    file: process.env.SOUNDS_GIFT_GOLD_BOXING_GLOVES_FILE || sampleConfig.sounds?.gift?.["gold boxing gloves"]?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_GOLD_BOXING_GLOVES_VOLUME) || sampleConfig.sounds?.gift?.["gold boxing gloves"]?.volume || 0.1
                },
                "dougnut": {
                    file: process.env.SOUNDS_GIFT_DOUGNUT_FILE || sampleConfig.sounds?.gift?.dougnut?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_DOUGNUT_VOLUME) || sampleConfig.sounds?.gift?.dougnut?.volume || 0.1
                },
                "cap": {
                    file: process.env.SOUNDS_GIFT_CAP_FILE || sampleConfig.sounds?.gift?.cap?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_CAP_VOLUME) || sampleConfig.sounds?.gift?.cap?.volume || 0.1
                },
                "super gg": {
                    file: process.env.SOUNDS_GIFT_SUPER_GG_FILE || sampleConfig.sounds?.gift?.["super gg"]?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_SUPER_GG_VOLUME) || sampleConfig.sounds?.gift?.["super gg"]?.volume || 0.1
                },
                "throw tomaroes": {
                    file: process.env.SOUNDS_GIFT_THROW_TOMAROES_FILE || sampleConfig.sounds?.gift?.["throw tomaroes"]?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_GIFT_THROW_TOMAROES_VOLUME) || sampleConfig.sounds?.gift?.["throw tomaroes"]?.volume || 0.1
                }
            },
            subscribe: {
                file: process.env.SOUNDS_SUBSCRIBE_FILE || sampleConfig.sounds?.subscribe?.file || '/sounds/enchanted.wav',
                volume: parseFloat(process.env.SOUNDS_SUBSCRIBE_VOLUME) || sampleConfig.sounds?.subscribe?.volume || 0.1
            },
            follow: [
                {
                    file: process.env.SOUNDS_FOLLOW_FILE || sampleConfig.sounds?.follow?.[0]?.file || '/sounds/enchanted.wav',
                    volume: parseFloat(process.env.SOUNDS_FOLLOW_VOLUME) || sampleConfig.sounds?.follow?.[0]?.volume || 0.1
                }
            ]
        }
    };

    // Write the final config
    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    
    console.log('✅ Config built successfully!');
    console.log(`📁 Output: ${outputPath}`);
    
    // Log what was used
    console.log('\n📋 Configuration sources:');
    console.log(`TikTok enabled: ${config.tiktok.enabled} (${process.env.TIKTOK_ENABLED ? 'env' : 'sample'})`);
    console.log(`Kick enabled: ${config.kick.enabled} (${process.env.KICK_ENABLED ? 'env' : 'sample'})`);
    console.log(`Hue enabled: ${config.hue.enabled} (${process.env.HUE_ENABLED ? 'env' : 'sample'})`);
    
} catch (error) {
    console.error('❌ Error building config:', error.message);
    process.exit(1);
}
