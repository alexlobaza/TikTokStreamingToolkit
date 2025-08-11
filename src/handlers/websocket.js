// websocket/handlers.js - Socket.io event handlers
const { getGlobalConnectionCount } = require('../services/tiktok');
const { getGlobalKickWebhookCount } = require('../services/kick');
const services = require('../services');
const apiClient = require('../utils/apiClient');

// TikTok connection wrapper setup
function setupTikTokEventListeners(socket, tiktokConnectionWrapper, config) {
    // Connected event
    tiktokConnectionWrapper.once('connected', state => {
        socket.emit('tiktokConnected', state);

        // Call the startStream API if enabled
        if (config.apiCalls.startStream && config.apiCalls.startStream.enabled) {
            apiClient.callApi(config.apiCalls.startStream.endpoint, config)
                .then(result => console.log('Stream start notification sent:', result));
        }

        if (services.comments.isOffsiteSyncEnabled()) {
            services.comments.startOffsiteSync();
        }
    });

    // Disconnected event
    tiktokConnectionWrapper.once('disconnected', reason => socket.emit('tiktokDisconnected', reason));

    // Stream end event
    tiktokConnectionWrapper.connection.on('streamEnd', () => {
        socket.emit('streamEnd');

        // Call the endStream API if enabled
        if (config.apiCalls.endStream && config.apiCalls.endStream.enabled) {
            apiClient.callApi(config.apiCalls.endStream.endpoint, config)
                .then(result => console.log('Stream end notification sent:', result));
            services.comments.shutdown();
        }
    });

    // Room user event
    tiktokConnectionWrapper.connection.on('roomUser', msg => {
        socket.emit('roomUser', msg);
        services.viewers.update({
            viewerCount: msg.viewerCount,
            msgId: msg.msgId || `roomUser_${Date.now()}`,
            roomId: msg.roomId
        });
    });

    // Member event
    tiktokConnectionWrapper.connection.on('member', msg => socket.emit('member', msg));
    
    // Chat event
    tiktokConnectionWrapper.connection.on('chat', msg => { 
        socket.emit('chat', msg);
        services.comments.update(msg);
    });

    // Gift event
    tiktokConnectionWrapper.connection.on('gift', msg => {
        socket.emit('gift', msg);
        services.gifterRank.update(msg);

        // Add to comments with gift info
        const { repeatEnd, giftType } = msg;
        if (repeatEnd == true || giftType != 1) {
            const giftComment = {
                ...msg,
                comment: `Sent gift: ${msg.giftName} x${msg.repeatCount}`,
                isGift: true,
                eventType: 'gift'
            };
            services.comments.update(giftComment);
        }
    });

    // Social event
    tiktokConnectionWrapper.connection.on('social', msg => {
        socket.emit('social', msg);
        
        // Only add shares (type = 3)
        if (msg.displayType === 3 || msg.label?.includes('shared')) {
            const shareComment = {
                ...msg,
                comment: 'Shared the stream',
                isShare: true,
                eventType: 'share'
            };
            services.comments.update(shareComment);
        }
    });
    
    // Like event
    tiktokConnectionWrapper.connection.on('like', msg => {
        socket.emit('like', msg);
        services.likeRank.update(msg);
    });

    // Other events
    tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
    tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
    tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
    tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
    
    // Subscribe event
    tiktokConnectionWrapper.connection.on('subscribe', msg => {
        socket.emit('subscribe', msg);
        
        // Add to comments
        const subscribeComment = {
            ...msg,
            comment: 'Subscribed to the channel',
            isSubscribe: true,
            eventType: 'subscribe'
        };
        services.comments.update(subscribeComment);
    });

    // New follower event
    socket.on('newFollower', (data) => {
        const newCount = services.followers.updateFollowerCount(data.uniqueId);
        
        // Add to comments
        const followComment = {
            uniqueId: data.uniqueId,
            nickname: data.nickname || data.uniqueId,
            profilePictureUrl: data.profilePictureUrl || '',
            comment: 'Followed the channel',
            isFollow: true,
            eventType: 'follow',
            createTime: Date.now().toString()
        };
        services.comments.update(followComment);
    });

    // Stream end event from client
    socket.on('streamEnd', () => {
        // Call the endStream API if enabled
        if (config.apiCalls.endStream && config.apiCalls.endStream.enabled) {
            apiClient.callApi(config.apiCalls.endStream.endpoint, config)
                .then(result => console.log('Stream end notification sent:', result));
        }
    });
}

// Kick connection wrapper setup
function setupKickEventListeners(socket, kickConnectionWrapper, config) {
    // Connected event
    kickConnectionWrapper.once('connected', state => {
        socket.emit('kickConnected', state);

        // Call the startStream API if enabled
        if (config.apiCalls.startStream && config.apiCalls.startStream.enabled) {
            apiClient.callApi(config.apiCalls.startStream.endpoint, config)
                .then(result => console.log('Kick stream start notification sent:', result));
        }

        if (services.comments.isOffsiteSyncEnabled()) {
            services.comments.startOffsiteSync();
        }
    });

    // Disconnected event
    kickConnectionWrapper.once('disconnected', reason => socket.emit('kickDisconnected', reason));

    // Chat event
    kickConnectionWrapper.on('chat', msg => { 
        socket.emit('chat', msg);
        services.comments.update(msg);
    });

    // Gift event
    kickConnectionWrapper.on('gift', msg => {
        socket.emit('gift', msg);
        services.gifterRank.update(msg);

        // Add to comments with gift info
        const giftComment = {
            ...msg,
            comment: `Sent gift: ${msg.giftName} x${msg.repeatCount}`,
            isGift: true,
            eventType: 'gift'
        };
        services.comments.update(giftComment);
    });
    
    // Like event
    kickConnectionWrapper.on('like', msg => {
        socket.emit('like', msg);
        services.likeRank.update(msg);
    });

    // Follow event
    kickConnectionWrapper.on('follow', msg => {
        socket.emit('follow', msg);
        services.followers.update(msg);
    });

    // Stream events
    kickConnectionWrapper.on('streamStarted', msg => {
        socket.emit('streamStarted', msg);
    });

    kickConnectionWrapper.on('streamEnded', msg => {
        socket.emit('streamEnded', msg);
    });

    // Viewer count updates
    kickConnectionWrapper.on('viewerCount', msg => {
        socket.emit('viewerCount', msg);
        services.viewers.update({
            viewerCount: msg.viewerCount,
            msgId: `kick_viewer_${Date.now()}`,
            roomId: `kick_${kickConnectionWrapper.channelName}`
        });
    });
}

// Setup socket connection handlers
function setupSocketHandlers(io, config) {
    io.on('connection', (socket) => {

        let tiktokConnectionWrapper;
        let kickConnectionWrapper;

        // Connect to TikTok with retry mechanism
        function connectTikTokWithRetry(uniqueId, options, retryCount = 0) {
            try {
                tiktokConnectionWrapper = new services.tiktok.TikTokConnectionWrapper(uniqueId, options, true);
                tiktokConnectionWrapper.connect();
                
                // If connection is successful, set up event listeners
                setupTikTokEventListeners(socket, tiktokConnectionWrapper, config);
            } catch (err) {
                console.error(`TikTok connection attempt ${retryCount + 1} failed:`, err.toString());
                socket.emit('tiktokConnectionAttempt', { 
                    success: false, 
                    error: err.toString(), 
                    retryCount: retryCount + 1 
                });

                // Retry after 1 minute
                setTimeout(() => {
                    connectTikTokWithRetry(uniqueId, options, retryCount + 1);
                }, 60000); // 60000 ms = 1 minute
            }
        }

        // Connect to Kick with retry mechanism
        function connectKickWithRetry(channelName, appKey, appSecret, retryCount = 0) {
            try {
                kickConnectionWrapper = new services.kick.KickConnectionWrapper(channelName, appKey, appSecret, {}, true);
                kickConnectionWrapper.connect();
                
                // If connection is successful, set up event listeners
                setupKickEventListeners(socket, kickConnectionWrapper, config);
            } catch (err) {
                console.error(`Kick connection attempt ${retryCount + 1} failed:`, err.toString());
                socket.emit('kickConnectionAttempt', { 
                    success: false, 
                    error: err.toString(), 
                    retryCount: retryCount + 1 
                });

                // Retry after 1 minute
                setTimeout(() => {
                    connectKickWithRetry(channelName, appKey, appSecret, retryCount + 1);
                }, 60000); // 60000 ms = 1 minute
            }
        }

        // Handle setUniqueId event (TikTok) - only if enabled
        socket.on('setUniqueId', (uniqueId, options) => {
            if (!config.tiktok?.enabled) {
                socket.emit('tiktokConnectionAttempt', { 
                    success: false, 
                    error: 'TikTok is disabled in configuration' 
                });
                return;
            }

            // Prohibit the client from specifying these options (for security reasons)
            if (typeof options === 'object') {
                delete options.requestOptions;
                delete options.websocketOptions;
            }

            // Is the client already connected to TikTok? => Disconnect
            if (tiktokConnectionWrapper) {
                tiktokConnectionWrapper.disconnect();
            }

            // Connect to the given username (uniqueId) with retry mechanism
            connectTikTokWithRetry(uniqueId, options);
        });

        // Handle setKickChannel event - only if enabled
        socket.on('setKickChannel', (channelName, appKey, appSecret) => {
            if (!config.kick?.enabled) {
                socket.emit('kickConnectionAttempt', { 
                    success: false, 
                    error: 'Kick is disabled in configuration' 
                });
                return;
            }

            // Is the client already connected to Kick? => Disconnect
            if (kickConnectionWrapper) {
                kickConnectionWrapper.disconnect();
            }

            // Connect to the given channel with retry mechanism
            connectKickWithRetry(channelName, appKey, appSecret);
        });

        // Handle disconnect event
        socket.on('disconnect', () => {
            if (tiktokConnectionWrapper) {
                tiktokConnectionWrapper.disconnect();
            }
            if (kickConnectionWrapper) {
                kickConnectionWrapper.disconnect();
            }
        });

        // Emit Hue light triggers to client for local network access
        socket.on('subscribeLights', () => {
            if (config.hue.enabled) {
                socket.emit('hueTrigger', {
                    action: 'pulseGroupLights',
                    targetGroupId: config.hue.targetGroupId,
                    options: {
                        duration: 150,
                        count: 10,
                        color: [0.67, 0.33],
                        brightnessIncrease: 200,
                        transitionTime: 10
                    }
                });
            }
        });
        socket.on('newFollowerLights', () => {
            if (config.hue.enabled) {
                socket.emit('hueTrigger', {
                    action: 'pulseGroupLights',
                    targetGroupId: config.hue.targetGroupId,
                    options: {
                        duration: 100,
                        count: 4,
                        color: [0.45, 0.41], // Warm white
                        brightnessIncrease: 100,
                        transitionTime: 10
                    }
                });
            }
        });
        socket.on('giftLights', () => {
            if (config.hue.enabled) {
                socket.emit('hueTrigger', {
                    action: 'pulseGroupLights',
                    targetGroupId: config.hue.targetGroupId,
                    options: {
                        duration: 100,
                        count: 3,
                        color: [0.55, 0.45],
                        brightnessIncrease: 100,
                        transitionTime: 10
                    }
                });
            }
        });
    });

            // Emit global connection statistics
        setInterval(() => {
            io.emit('statistic', { 
                globalConnectionCount: getGlobalConnectionCount(),
                globalKickWebhookCount: getGlobalKickWebhookCount()
            });
        }, 5000);
}

module.exports = setupSocketHandlers;