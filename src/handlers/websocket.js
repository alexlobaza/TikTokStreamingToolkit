// websocket/handlers.js - Socket.io event handlers
const { getGlobalConnectionCount } = require('../services/tiktok');
const { WebcastEvent } = require('tiktok-live-connector');
const services = require('../services');
const apiClient = require('../utils/apiClient');

// TikTok connection wrapper setup
function setupEventListeners(socket, tiktokConnectionWrapper, config) {
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
    tiktokConnectionWrapper.connection.on(WebcastEvent.STREAM_END, () => {
        socket.emit('streamEnd');

        // Call the endStream API if enabled
        if (config.apiCalls.endStream && config.apiCalls.endStream.enabled) {
            apiClient.callApi(config.apiCalls.endStream.endpoint, config)
                .then(result => console.log('Stream end notification sent:', result));
            services.comments.shutdown();
        }
    });

    // Room user event
    tiktokConnectionWrapper.connection.on(WebcastEvent.ROOM_USER, msg => {
        socket.emit('roomUser', msg);
        services.viewers.update({
            viewerCount: msg.viewerCount,
            msgId: msg.msgId || `roomUser_${Date.now()}`,
            roomId: msg.roomId
        });
    });

    // Member event
    tiktokConnectionWrapper.connection.on(WebcastEvent.MEMBER, msg => socket.emit('member', msg));
    
    // Chat event
    tiktokConnectionWrapper.connection.on(WebcastEvent.CHAT, msg => { 
        socket.emit('chat', msg);
        services.comments.update(msg);
    });

    // Gift event
    tiktokConnectionWrapper.connection.on(WebcastEvent.GIFT, msg => {
        socket.emit('gift', msg);
        services.gifterRank.update(msg);

        // Add to comments with gift info
        const { repeatEnd, giftType } = msg;
        if (repeatEnd == true || giftType != 1) {
            const giftComment = {
                ...msg,
                comment: `Sent gift: ${msg.giftDetails.giftName} x${msg.repeatCount}`,
                isGift: true,
                eventType: 'gift'
            };
            services.comments.update(giftComment);
        }
    });

    // Social event
    tiktokConnectionWrapper.connection.on(WebcastEvent.SHARE, msg => {
        socket.emit('share', msg);
        
        // Process all share events (removed restrictive filter)
        // TikTok may send shares with different displayType values
        const shareComment = {
            ...msg,
            comment: 'Shared the stream',
            isShare: true,
            eventType: 'share',
            msgId: msg.common?.msgId || msg.msgId || `share_${Date.now()}`,
            createTime: msg.common?.createTime || msg.createTime || Date.now().toString(),
            roomId: msg.roomId
        };
        services.comments.update(shareComment);
    });

    // Follow event
    tiktokConnectionWrapper.connection.on(WebcastEvent.FOLLOW, msg => {
        socket.emit('follow', msg);
        
        // Add to comments with follow info
        const followComment = {
            ...msg,
            comment: 'Followed the streamer',
            isFollow: true,
            eventType: 'follow',
            msgId: msg.msgId || `follow_${Date.now()}`,
            roomId: msg.roomId
        };
        services.comments.update(followComment);
    });
    
    // Like event
    tiktokConnectionWrapper.connection.on(WebcastEvent.LIKE, msg => {
        socket.emit('like', msg);
        services.likeRank.update(msg);
    });

    // Other events
    tiktokConnectionWrapper.connection.on(WebcastEvent.QUESTION_NEW, msg => socket.emit('questionNew', msg));
    tiktokConnectionWrapper.connection.on(WebcastEvent.LINK_MIC_BATTLE, msg => socket.emit('linkMicBattle', msg));
    tiktokConnectionWrapper.connection.on(WebcastEvent.LINK_MIC_ARMIES, msg => socket.emit('linkMicArmies', msg));
    tiktokConnectionWrapper.connection.on(WebcastEvent.LIVE_INTRO, msg => socket.emit('liveIntro', msg));
    
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

    tiktokConnectionWrapper.connection.on(WebcastEvent.SUPER_FAN, msg => {
        socket.emit('superFan', msg);

        const superFanComment = {
            ...msg,
            comment: 'Became a Super Fan',
            isSuperFan: true,
            eventType: 'superFan'
        };

        services.comments.update(superFanComment);
    });

    // New follower event
    socket.on('newFollower', (data) => {
        if (!data.user) {
            return;
        }

        services.followers.updateFollowerCount(data.user.uniqueId);
        
        // Add to comments
        const followComment = {
            uniqueId: data.user.uniqueId,
            nickname: data.user.nickname || data.user.uniqueId,
            profilePictureUrl: data.user.profilePicture["url"][0] || '',
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

// Setup socket connection handlers
function setupSocketHandlers(io, config) {
    io.on('connection', (socket) => {

        let tiktokConnectionWrapper;

        // Connect to TikTok with retry mechanism
        function connectWithRetry(uniqueId, options, retryCount = 0) {
            try {
                tiktokConnectionWrapper = new services.tiktok.TikTokConnectionWrapper(uniqueId, options, true);
                tiktokConnectionWrapper.connect();
                
                // If connection is successful, set up event listeners
                setupEventListeners(socket, tiktokConnectionWrapper, config);
            } catch (err) {
                console.error(`Connection attempt ${retryCount + 1} failed:`, err.toString());
                socket.emit('connectionAttempt', { 
                    success: false, 
                    error: err.toString(), 
                    retryCount: retryCount + 1 
                });

                // Retry after 1 minute
                setTimeout(() => {
                    connectWithRetry(uniqueId, options, retryCount + 1);
                }, 60000); // 60000 ms = 1 minute
            }
        }

        // Handle setUniqueId event
        socket.on('setUniqueId', (uniqueId, options) => {
            // Prohibit the client from specifying these options (for security reasons)
            if (typeof options === 'object') {
                delete options.requestOptions;
                delete options.websocketOptions;
            }

            // Is the client already connected to a stream? => Disconnect
            if (tiktokConnectionWrapper) {
                tiktokConnectionWrapper.disconnect();
            }

            // Connect to the given username (uniqueId) with retry mechanism
            connectWithRetry(uniqueId, options);
        });

        // Handle disconnect event
        socket.on('disconnect', () => {
            if (tiktokConnectionWrapper) {
                tiktokConnectionWrapper.disconnect();
            }
        });

        // Listen for light effect triggers from client
        socket.on('subscribeLights', () => {
            if (config.hue.enabled) {
                services.hue.pulseGroupLights(config.hue.targetGroupId, {
                    duration: 150,
                    count: 10,
                    color: [0.67, 0.33],
                    brightnessIncrease: 200,
                    transitionTime: 10
                }).catch(error => console.error('Error pulsing lights for subscribe:', error));
            }
        });
        socket.on('newFollowerLights', () => {
            if (config.hue.enabled) {
                services.hue.pulseGroupLights(config.hue.targetGroupId, {
                    duration: 100,
                    count: 4,
                    color: [0.45, 0.41], // Warm white
                    brightnessIncrease: 100,
                    transitionTime: 10
                }).catch(error => console.error('Error pulsing lights for new follower:', error));
            }
        });
        socket.on('giftLights', () => {
            if (config.hue.enabled) {
                services.hue.pulseGroupLights(config.hue.targetGroupId, {
                    duration: 100,
                    count: 3,
                    color: [0.55, 0.45],
                    brightnessIncrease: 100,
                    transitionTime: 10
                }).catch(error => console.error('Error pulsing lights for gift:', error));
            }
        });
        socket.on('shareLights', () => {
            if (config.hue.enabled) {
                services.hue.pulseGroupLights(config.hue.targetGroupId, {
                    duration: 100,
                    count: 2,
                    color: [0.5, 0.5], // Neutral color
                    brightnessIncrease: 50,
                    transitionTime: 10
                }).catch(error => console.error('Error pulsing lights for share:', error));
            }
        });
    });

    // Emit global connection statistics
    setInterval(() => {
        io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
    }, 5000);
}

module.exports = setupSocketHandlers;