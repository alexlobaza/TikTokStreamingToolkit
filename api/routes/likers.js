// api/routes/likers.js - Like ranking routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');

// Get top likers
router.get('/like-rank', (req, res) => {
    try {
        const likerData = services.likeRank.getTopLikers(3);
        res.json({topLikers: likerData});
    } catch (error) {
        console.error('Error reading like rank API:', error);
        res.status(500).json({ error: 'Failed to read like rank data' });
    }
});

module.exports = router;