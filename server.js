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
