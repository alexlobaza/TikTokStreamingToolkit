// api/routes/gifters.js - Gifter ranking routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');

// Get top gifters
router.get('/gifter-rank', (req, res) => {
    try {
        const gifterData = services.gifterRank.getTopGifters(3);
        res.json({topGifters: gifterData});
    } catch (error) {
        console.error('Error reading gifter rank API:', error);
        res.status(500).json({ error: 'Failed to read gifter rank data' });
    }
});

// Get total diamond count
router.get('/gift-count', (req, res) => {
    try {
        const gifterData = services.gifterRank.getTotalDiamonds();
        res.json({count: gifterData});
    } catch (error) {
        console.error('Error reading gifter rank API:', error);
        res.status(500).json({ error: 'Failed to read gifter rank data' });
    }
});

module.exports = router;