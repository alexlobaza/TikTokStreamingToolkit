require('dotenv').config();

const fs = require('fs');

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const hueModule = require('./src/modules/hueModule');
const GifterRank = require('./src/modules/gifterRank');
const LikeRank = require('./src/modules/likeRank');
const Comments = require('./src/modules/comments')
const Viewers = require('./src/modules/viewers');
const Followers = require('./src/modules/followers');
const KickOAuthHandler = require('./src/services/kickOAuthHandler');

// Import API routes
const apiRoutes = require('./api');
const setupSocketHandlers = require('./src/handlers/websocket');

// Global server status tracking
global.serverStatus = 'running';
global.serverIntervals = {};

// Auto-sleep functionality
function scheduleAutoSleep(reason = 'Stream ended') {
    console.log(`🛏️  Scheduling auto-sleep in 1 minute (${reason})...`);
    
    // Clear any existing auto-sleep timer
    if (global.autoSleepTimer) {
        clearTimeout(global.autoSleepTimer);
    }
    
    // Set new auto-sleep timer (1 minute = 60000ms)
    global.autoSleepTimer = setTimeout(() => {
        console.log('🛏️  Auto-sleep timer expired - putting server to sleep...');
        
        // Only auto-sleep if server is currently running
        if (global.serverStatus === 'running') {
            // Stop all connections
            try {
                // Stop Kick webhook handler
                if (kickWebhookHandler) {
                    kickWebhookHandler.emit('stop');
                    console.log('✅ Kick webhook handler stopped (auto-sleep)');
                }
                
                // Clear any active intervals or timers
                if (global.serverIntervals) {
                    Object.values(global.serverIntervals).forEach(interval => clearInterval(interval));
                    global.serverIntervals = {};
                    console.log('✅ All intervals cleared (auto-sleep)');
                }
                
                // Update server status
                global.serverStatus = 'stopped';
                
                // Reset stream start flag for next stream
                global.streamStartHandled = false;
                console.log('🛏️  Server is now sleeping (auto-sleep)');
                
            } catch (error) {
                console.error('❌ Error during auto-sleep:', error);
            }
        } else {
            console.log('🛏️  Server already stopped, skipping auto-sleep');
        }
        
        // Clear the timer reference
        global.autoSleepTimer = null;
        
    }, 60000); // 1 minute
    
    console.log('🛏️  Auto-sleep scheduled successfully');
}

// API Key authentication middleware
function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = config.security?.apiKey;
    
    if (!expectedApiKey || expectedApiKey === 'your-secure-api-key-here') {
        console.warn('⚠️  No API key configured - control endpoints are open!');
        return next();
    }
    
    if (!apiKey || apiKey !== expectedApiKey) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing API key'
        });
    }
    
    next();
}

const app = express();
const httpServer = createServer(app);

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});


// Use config loader with environment variable support
const ConfigLoader = require('./src/config-loader');
const configLoader = new ConfigLoader();
const config = configLoader.getAll();

const gifterRank = new GifterRank(config);
const likeRank = new LikeRank(config);
const comments = new Comments(config);
const viewers = new Viewers(config);
const followers = new Followers(config);

// Serve frontend files
app.use(express.static('public'));
app.use((req, res, next) => {
    req.io = io;
    next();
});

setupSocketHandlers(io, config);

// Handle auto-sleep events from clients
io.on('connection', (socket) => {
    socket.on('scheduleAutoSleep', (data) => {
        console.log('🛏️  Auto-sleep requested by client:', data.reason);
        scheduleAutoSleep(data.reason);
    });
});

// Load API routes
app.use('/api', apiRoutes);

// Initialize Kick OAuth handler
const kickOAuthHandler = new KickOAuthHandler(
    config.kick?.appKey || '01K2CHA37J8SFQVVTVQF5DB76K',
    config.kick?.appSecret || '8140d53f799e118feb47367e852c8800b8c4b75050532a6b0c1e599433b19a84',
    'http://localhost:8082'
);

// Add OAuth routes
kickOAuthHandler.createRoutes(app);

// Initialize Kick webhook handler if Kick is enabled
let kickWebhookHandler = null;
if (config.kick?.enabled) {
    const { KickWebhookHandler } = require('./src/services/kick');
    kickWebhookHandler = new KickWebhookHandler(
        config.kick.channelName,
        null, // We'll get the token from OAuth flow
        {},
        true
    );

    // Set up event forwarding from webhook handler to Socket.IO
    kickWebhookHandler.on('chat', (event) => {
        console.log('📱 Forwarding Kick chat event to frontend');
        io.emit('chat', event);
        // Update services
        comments.update(event);
    });

    kickWebhookHandler.on('gift', (event) => {
        console.log('🎁 Forwarding Kick gift event to frontend');
        io.emit('gift', event);
        // Update services
        gifterRank.update(event);
        const giftComment = {
            ...event,
            comment: `Sent gift: ${event.giftName} x${event.repeatCount}`,
            isGift: true,
            eventType: 'gift'
        };
        comments.update(giftComment);
    });

    kickWebhookHandler.on('follow', (event) => {
        console.log('👥 Forwarding Kick follow event to frontend');
        io.emit('follow', event);
        // Update services
        followers.updateFollowerCount(event.user);
        
        // Add to comments
        const followComment = {
            ...event,
            comment: 'Followed the channel',
            isFollow: true,
            eventType: 'follow'
        };
        comments.update(followComment);
    });

    kickWebhookHandler.on('subscription', (event) => {
        console.log('⭐ Forwarding Kick subscription event to frontend');
        io.emit('subscription', event);
        // Add to comments
        const subscriptionComment = {
            ...event,
            comment: 'Subscribed to the channel',
            isSubscribe: true,
            eventType: 'subscription'
        };
        comments.update(subscriptionComment);
    });

    kickWebhookHandler.on('subscriptionRenewal', (event) => {
        console.log('🔄 Forwarding Kick subscription renewal event to frontend');
        io.emit('subscriptionRenewal', event);
        // Add to comments
        const renewalComment = {
            ...event,
            comment: `Renewed subscription for ${event.duration} month(s)`,
            isSubscribe: true,
            eventType: 'subscriptionRenewal'
        };
        comments.update(renewalComment);
    });

    kickWebhookHandler.on('subscriptionGift', (event) => {
        console.log('🎁 Forwarding Kick subscription gift event to frontend');
        io.emit('subscriptionGift', event);
        // Add to comments
        const giftComment = {
            ...event,
            comment: `Gifted ${event.giftees.length} subscription(s)`,
            isGift: true,
            eventType: 'subscriptionGift'
        };
        comments.update(giftComment);
    });

    kickWebhookHandler.on('livestreamStatus', (event) => {
        console.log('📺 Forwarding Kick livestream status event to frontend');
        io.emit('livestreamStatus', event);
        
        if (event.isLive) {
            io.emit('streamStarted', event);
        } else {
            io.emit('streamEnded', event);
        }
    });

    kickWebhookHandler.on('viewerCount', (event) => {
        console.log('👀 Forwarding Kick viewer count event to frontend');
        io.emit('viewerCount', event);
        // Update services
        viewers.update({
            viewerCount: event.viewerCount,
            msgId: `kick_viewer_${Date.now()}`,
            roomId: `kick_${kickWebhookHandler.channelName}`
        });
    });

    kickWebhookHandler.on('streamStarted', (event) => {
        console.log('📺 Forwarding Kick stream started event to frontend');
        io.emit('streamStarted', event);
    });

    kickWebhookHandler.on('streamEnded', (event) => {
        console.log('📺 Forwarding Kick stream ended event to frontend');
        io.emit('streamEnded', event);
        
        // Schedule auto-sleep in 1 minute
        scheduleAutoSleep('Kick stream ended');
    });

    console.log('✅ Kick webhook handler initialized and connected to Socket.IO');
}

// Add webhook endpoint for Kick events
app.post('/webhook/kick', express.json(), (req, res) => {
    console.log('📥 Received Kick webhook:', req.headers['kick-event-type']);
    
    // Process the webhook event
    if (kickWebhookHandler) {
        const result = kickWebhookHandler.processWebhookEvent(req.headers, JSON.stringify(req.body));
        if (result.success) {
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ error: result.error });
        }
    } else {
        res.status(500).json({ error: 'Kick webhook handler not initialized' });
    }
});

// Server Control Endpoints
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

app.post('/control/stop', authenticateApiKey, (req, res) => {
    console.log('🛑 STOP command received - stopping all connections...');
    
    try {
        // Stop Kick webhook handler
        if (kickWebhookHandler) {
            kickWebhookHandler.emit('stop');
            console.log('✅ Kick webhook handler stopped');
        }
        
        // Clear any active intervals or timers
        if (global.serverIntervals) {
            Object.values(global.serverIntervals).forEach(interval => clearInterval(interval));
            global.serverIntervals = {};
            console.log('✅ All intervals cleared');
        }
        
        // Update server status
        global.serverStatus = 'stopped';
        
        // Reset stream start flag when stopping
        global.streamStartHandled = false;
        
        res.json({ 
            success: true, 
            message: 'Server stopped successfully',
            status: 'stopped',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error stopping server:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/control/start', authenticateApiKey, (req, res) => {
    console.log('▶️ START command received - restarting all connections...');
    
    try {
        // Start Kick webhook handler
        if (config.kick?.enabled && kickWebhookHandler) {
            kickWebhookHandler.emit('start');
            console.log('✅ Kick webhook handler started');
        }
        
        // Update server status
        global.serverStatus = 'running';
        
        // Reset stream start flag when starting
        global.streamStartHandled = false;
        
        // Clear any existing auto-sleep timer when manually starting
        if (global.autoSleepTimer) {
            clearTimeout(global.autoSleepTimer);
            global.autoSleepTimer = null;
            console.log('🛏️  Auto-sleep timer cleared (manual start)');
        }
        
        // Reset all data files for fresh start
        console.log('🔄 Resetting all data files for fresh stream...');
        viewers.initialize();
        gifterRank.initialize();
        likeRank.initialize();
        comments.initialize();
        followers.initialize();
        console.log('✅ All data files reset successfully');
        
        res.json({ 
            success: true, 
            message: 'Server started successfully with fresh data',
            status: 'running',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error starting server:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/control/status', authenticateApiKey, (req, res) => {
    res.json({
        status: global.serverStatus || 'running',
        timestamp: new Date().toISOString(),
        connections: {
            tiktok: config.tiktok?.enabled ? (global.serverStatus === 'running' ? 'connected' : 'disconnected') : 'disabled',
            kick: config.kick?.enabled ? (global.serverStatus === 'running' ? 'subscribed' : 'unsubscribed') : 'disabled',
            youtube: config.youtube?.enabled ? (global.serverStatus === 'running' ? 'connected' : 'disabled') : 'disabled'
        },
        autoSleep: {
            scheduled: global.autoSleepTimer !== null && global.autoSleepTimer !== undefined,
            timer: global.autoSleepTimer ? 'active' : 'none'
        }
    });
});

// Health check endpoint
app.get('/health', authenticateApiKey, (req, res) => {
    res.json({
        status: 'healthy',
        serverStatus: global.serverStatus || 'running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

viewers.initialize();
gifterRank.initialize();
likeRank.initialize();
comments.initialize();
followers.initialize();

// Hue calls moved to client-side for local network access
// if(config.hue.enabled) {
//   hueModule.fetchInitialGroupState(config.hue.targetGroupId);
// }

// Serve widget pages
const widgetPages = [
  { path: '/follower-goal', file: 'follower-goal/follower-goal.html' },
  { path: '/gift-goal', file: 'gift-goal/gift-goal.html' },
  { path: '/gifter-rank', file: 'gifter-rank/gifter-rank.html' },
  { path: '/like-rank', file: 'like-rank/like-rank.html' },
  { path: '/text-scroller', file: 'text-scroller/text-scroller.html' },
  { path: '/comments', file: 'comments/comments.html' },
  { path: '/image-slider', file: 'image-slider/image-slider.html' },
];
widgetPages.forEach(({ path: routePath, file }) => {
  app.get(routePath, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', file));
  });
});

// Start http listener
const port = process.env.PORT || 8082;
httpServer.listen(port);
console.info(`Server running! Widget is available at http://localhost:${port} as of now!`);
