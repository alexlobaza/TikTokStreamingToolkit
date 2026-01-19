// api/routes/hue.js - Hue-related routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');
const fs = require('fs');
const path = require('path');

// Read config to get the target group ID
const configPath = path.join(__dirname, '..', '..', 'public', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Refetch initial lights state
router.post('/hue/refetch-initial-state', async (req, res) => {
    try {
        if (!config.hue.enabled) {
            return res.status(400).json({ error: 'Hue lights are not enabled in config' });
        }

        const groupId = config.hue.targetGroupId;
        if (!groupId) {
            return res.status(400).json({ error: 'Hue target group ID is not configured' });
        }

        await services.hue.fetchInitialGroupState(groupId);
        res.json({ 
            success: true, 
            message: 'Initial lights state refetched successfully',
            groupId: groupId
        });
    } catch (error) {
        console.error('Error refetching initial lights state:', error);
        res.status(500).json({ error: 'Error refetching initial lights state', details: error.message });
    }
});

module.exports = router;
