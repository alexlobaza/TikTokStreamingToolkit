// api/routes/hue.js - Hue-related routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');
const { getConfigStore } = require('../../src/modules/configStore');
const { LIGHT_EVENTS, playEffect } = require('../../src/modules/hueEffects');

// Refetch initial lights state
router.post('/hue/refetch-initial-state', async (req, res) => {
    try {
        const config = getConfigStore().current;
        if (!config.hue || !config.hue.enabled) {
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

// Preview the light effect for an event (gift, follow, subscribe, superFan, share).
// An optional JSON body with effect fields (see src/modules/hueEffects.js) is applied on
// top of config.json, so unsaved settings can be tried out. Plays even if the effect is
// disabled. Responds as soon as the effect has started.
router.post('/hue/test/:event', express.json(), async (req, res) => {
    const eventKey = req.params.event;
    if (!Object.prototype.hasOwnProperty.call(LIGHT_EVENTS, eventKey)) {
        return res.status(404).json({
            error: `Unknown event "${eventKey}"`,
            events: Object.keys(LIGHT_EVENTS)
        });
    }

    try {
        const override = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
            ? req.body
            : undefined;
        const result = await playEffect(eventKey, { override, force: true, wait: false });
        if (!result.played) {
            return res.status(400).json({ error: result.reason });
        }
        res.json({ success: true, event: eventKey, effect: result.effect });
    } catch (error) {
        console.error(`Error testing light effect for ${eventKey}:`, error);
        res.status(500).json({ error: 'Error testing light effect', details: error.message });
    }
});

module.exports = router;
