// services/index.js - Export all services
const fs = require('fs');
const path = require('path');
// const config = require('../config');

const configPath = path.join(__dirname, '..', '..', 'public', 'config.json');
const configData = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configData);

// Import services
const tiktok = require('./tiktok');
const kick = require('./kick');
const FollowersService = require('../modules/followers');
const CommentsService = require('../modules/comments');
const ViewersService = require('../modules/viewers');
const GifterRankService = require('../modules/gifterRank');
const LikeRankService = require('../modules/likeRank');
const hue = require('../modules/hueModule');

// Initialize service instances
const followers = new FollowersService(config);
const comments = new CommentsService(config);
const viewers = new ViewersService(config);
const gifterRank = new GifterRankService(config);
const likeRank = new LikeRankService(config);

// Export all services
module.exports = {
    tiktok,
    kick,
    followers,
    comments,
    viewers,
    gifterRank,
    likeRank,
    hue,
};