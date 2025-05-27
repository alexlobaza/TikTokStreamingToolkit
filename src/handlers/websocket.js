// websocket/handlers.js - Socket.io event handlers
const { getGlobalConnectionCount } = require('../services/tiktok');
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

        // Handle Philips Hue integration if enabled
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
        
        // Handle Philips Hue integration if enabled
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
        
        // Handle Philips Hue integration if enabled
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
    });

    // Emit global connection statistics
    setInterval(() => {
        io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
    }, 5000);
}

module.exports = setupSocketHandlers;