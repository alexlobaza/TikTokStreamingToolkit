// api/routes/followers.js - Follower-related routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');

// Get follower count
router.get('/follower-count', async (req, res) => {
    try {
        const followerCount = await services.followers.getFollowerCount();
        res.json(followerCount);
    } catch (error) {
        console.error('Error reading follower count:', error);
        res.status(500).json({ error: 'Error reading follower count' });
    }
});

module.exports = router;