// api/index.js - API routes aggregator
const express = require('express');
const router = express.Router();

// Import route modules
const commentsRoutes = require('./routes/comments');
const followersRoutes = require('./routes/followers');
const giftersRoutes = require('./routes/gifters');
const likersRoutes = require('./routes/likers');

// Use route modules
router.use('/comments', commentsRoutes);
router.use('/', followersRoutes); // Contains /follower-count
router.use('/', giftersRoutes);   // Contains /gifter-rank
router.use('/', likersRoutes);    // Contains /like-rank

module.exports = router;