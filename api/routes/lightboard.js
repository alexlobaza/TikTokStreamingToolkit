// api/routes/lightboard.js - Hue groups and the lightboard
//
// GET  /api/hue/groups              rooms, zones and entertainment areas on the bridge
// GET  /api/lightboard              pads from config.json and which one is running
// POST /api/lightboard/:id/start    start a pad (stops the running one first)
// POST /api/lightboard/:id/stop     stop it if it's the running pad
// POST /api/lightboard/:id/toggle   start, or stop if it's running
// POST /api/lightboard/stop         stop whatever is running
// POST /api/lightboard/try          run an unsaved pad (JSON body: a pad definition)
//
// State changes are also broadcast to socket.io clients as `lightboardState`.
const express = require('express');
const router = express.Router();
const { getConfigStore } = require('../../src/modules/configStore');
const { getLightboard, normalizePads } = require('../../src/modules/lightboard');

const TRY_ID = '__try';

function hueConfig() {
    return getConfigStore().current.hue || {};
}

/** Error response if Hue can't be used, else null */
function hueUnavailable(res) {
    const hue = hueConfig();
    if (!hue.enabled) {
        res.status(400).json({ error: 'Hue lights are not enabled in config' });
        return true;
    }
    return false;
}

function groupFor(pad) {
    return pad.groupId || hueConfig().targetGroupId || null;
}

async function startPad(pad, res) {
    const groupId = groupFor(pad);
    if (!groupId) {
        return res.status(400).json({ error: 'Choose a light group for this pad (or set hue.targetGroupId)' });
    }
    try {
        const state = await getLightboard().start(pad, groupId);
        res.json({ success: true, ...state });
    } catch (error) {
        console.error(`[lightboard] Error starting "${pad.title}":`, error.message);
        res.status(500).json({ error: `Couldn't start "${pad.title}"`, details: error.message });
    }
}

function findPad(id) {
    // Read config.json now rather than waiting for the watcher: a pad saved in the app a
    // moment ago (or just edited) should play right away, with its latest settings
    getConfigStore().reload();
    return normalizePads(hueConfig()).find(p => p.id === id) || null;
}

router.get('/hue/groups', async (req, res) => {
    if (hueUnavailable(res)) return;
    try {
        const hue = require('../../src/modules/hueModule');
        const [groups, lights] = await Promise.all([hue.getAllGroups(), hue.getAllLights()]);
        const list = Object.entries(groups)
            .filter(([, g]) => ['Room', 'Zone', 'Entertainment', 'LightGroup'].includes(g.type))
            .map(([id, g]) => ({
                id,
                name: g.name,
                type: g.type,
                lights: (g.lights || []).map(lightId => {
                    const light = lights[lightId] || {};
                    const control = (light.capabilities && light.capabilities.control) || {};
                    return {
                        id: String(lightId),
                        name: light.name || `Light ${lightId}`,
                        color: Boolean(control.colorgamuttype || (light.state && light.state.xy)),
                    };
                }),
            }))
            .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
        res.json({ targetGroupId: hueConfig().targetGroupId || null, groups: list });
    } catch (error) {
        res.status(502).json({ error: "Couldn't reach the Hue bridge", details: error.message });
    }
});

router.get('/lightboard', (req, res) => {
    res.json({
        hueEnabled: Boolean(hueConfig().enabled),
        defaultGroupId: hueConfig().targetGroupId || null,
        pads: normalizePads(hueConfig()),
        ...getLightboard().state(),
    });
});

router.post('/lightboard/stop', async (req, res) => {
    const stopped = await getLightboard().stop();
    res.json({ success: true, stopped, ...getLightboard().state() });
});

router.post('/lightboard/try', express.json(), async (req, res) => {
    if (hueUnavailable(res)) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const [pad] = normalizePads({ lightboard: { pads: [{ ...body, id: TRY_ID }] } });
    await startPad(pad, res);
});

router.post('/lightboard/:id/:action(start|stop|toggle)', async (req, res) => {
    const { id, action } = req.params;
    const lightboard = getLightboard();
    const running = lightboard.state().active;

    if (action === 'stop' || (action === 'toggle' && running && running.id === id)) {
        const stopped = running && running.id === id ? await lightboard.stop() : false;
        return res.json({ success: true, stopped, ...lightboard.state() });
    }

    if (hueUnavailable(res)) return;
    const pad = findPad(id);
    if (!pad) {
        return res.status(404).json({ error: `No lightboard pad "${id}"` });
    }
    await startPad(pad, res);
});

module.exports = router;
