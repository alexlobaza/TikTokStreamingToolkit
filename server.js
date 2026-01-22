require('dotenv').config();

const fs = require('fs');

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const shouldContinue = args.includes('--continue') || args.includes('-continue');

const hueModule = require('./src/modules/hueModule');
const GifterRank = require('./src/modules/gifterRank');
const LikeRank = require('./src/modules/likeRank');
const Comments = require('./src/modules/comments')
const Viewers = require('./src/modules/viewers');
const Followers = require('./src/modules/followers');

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


const configPath = path.join(__dirname, 'public', 'config.json');
const configData = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configData);

const gifterRank = new GifterRank(config);
const likeRank = new LikeRank(config);
const comments = new Comments(config);
const viewers = new Viewers(config);
const followers = new Followers(config);

// Pass initialized module instances to websocket handler to avoid duplicated state
const services = {
    tiktok: require('./src/services/tiktok'),
    followers,
    comments,
    viewers,
    gifterRank,
    likeRank,
    hue: hueModule,
};

// Serve frontend files
app.use(express.static('public'));
app.use((req, res, next) => {
    req.io = io;
    next();
});

setupSocketHandlers(io, config, services);

// Load API routes
app.use('/api', apiRoutes);

// Initialize modules (with continue flag to preserve data if restarting during live stream)
viewers.initialize(shouldContinue);
gifterRank.initialize(shouldContinue);
likeRank.initialize(shouldContinue);
comments.initialize(shouldContinue);
followers.initialize(shouldContinue);

if (shouldContinue) {
    console.log('Continuing existing stream - data and timestamps preserved.');
} else {
    console.log('Starting new stream - all data files reset.');
}

if(config.hue.enabled) {
  hueModule.fetchInitialGroupState(config.hue.targetGroupId);
}

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
