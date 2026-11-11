// api/routes/hue.js - Hue-related routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');
const { getConfigStore } = require('../../src/modules/configStore');
const { LIGHT_EVENTS, LIMITS, normalizeColor, playEffect, resolveEffect, toPulseOptions } = require('../../src/modules/hueEffects');
const { getPreviewController } = require('../../src/modules/huePreview');

// Refetch initial lights state
router.post('/hue/refetch-initial-state', async (req, res) => {
    try {
        const config = getConfigStore().current;
        if (!config.hue || !config.hue.enabled) {
            return res.status(400).json({ error: 'Hue lights are not enabled in config' });
        }
        if (getPreviewController().isActive()) {
            // Would capture the preview color as the lights' normal state
            return res.status(409).json({ error: 'Turn off the light preview before refetching the lights state' });
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

// Live light preview while editing, until DELETE. Send updates as often as you like.
// Body, to loop an event's effect (each run uses the latest settings):
//   { "event": "gift", "effect": { ...effect fields, as in hue.effects } }
// or, to hold one color at an effect's brightness:
//   { "color": "#RRGGBB" or [x, y], "brightnessIncrease": 0-254 }
router.post('/hue/preview', express.json(), async (req, res) => {
    const config = getConfigStore().current;
    if (!config.hue || !config.hue.enabled) {
        return res.status(400).json({ error: 'Hue lights are not enabled in config' });
    }
    const groupId = config.hue.targetGroupId;
    if (!groupId) {
        return res.status(400).json({ error: 'Hue target group ID is not configured' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (body.event !== undefined) {
        if (!Object.prototype.hasOwnProperty.call(LIGHT_EVENTS, body.event)) {
            return res.status(404).json({ error: `Unknown event "${body.event}"` });
        }
        const { effect } = resolveEffect(body.event, config.hue, body.effect);
        const pulse = { ...toPulseOptions(effect), turnOnIfOff: config.hue.lightUpWhenOff !== false };
        try {
            await getPreviewController().update(groupId, { pulse });
            return res.json({ success: true, active: true, mode: 'effect' });
        } catch (error) {
            console.error('Error starting light preview:', error);
            return res.status(500).json({ error: 'Error starting light preview', details: error.message });
        }
    }

    const xy = normalizeColor(body.color);
    if (!xy) {
        return res.status(400).json({ error: 'color must be "#RRGGBB" or [x, y]' });
    }
    const [min, max] = LIMITS.brightnessIncrease;
    const brightnessIncrease = typeof body.brightnessIncrease === 'number' && Number.isFinite(body.brightnessIncrease)
        ? Math.min(max, Math.max(min, body.brightnessIncrease))
        : 254;

    try {
        await getPreviewController().update(groupId, { xy, brightnessIncrease });
        res.json({ success: true, active: true });
    } catch (error) {
        console.error('Error starting light preview:', error);
        res.status(500).json({ error: 'Error starting light preview', details: error.message });
    }
});

router.delete('/hue/preview', async (req, res) => {
    try {
        const restored = await getPreviewController().stop();
        res.json({ success: true, restored });
    } catch (error) {
        console.error('Error ending light preview:', error);
        res.status(500).json({ error: 'Error ending light preview', details: error.message });
    }
});

module.exports = router;
