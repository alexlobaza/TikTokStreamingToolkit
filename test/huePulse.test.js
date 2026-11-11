// Runs pulseGroupLights / playEffect against a fake Hue bridge and checks the exact
// requests sent to it.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INITIAL = {
    '1': { on: true, bri: 100, xy: [0.3, 0.3] },
    '2': { on: true, bri: 200, xy: [0.4, 0.4] },
};

let server;
let requests = [];
let hue;
let hueEffects;
let configStore;
let configPath;

test.before(async () => {
    server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const send = data => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
            };
            let match;
            if (req.method === 'GET' && req.url === '/api/user/groups/1') {
                return send({ lights: ['1', '2'] });
            }
            if (req.method === 'GET' && (match = req.url.match(/^\/api\/user\/lights\/(\d+)$/))) {
                return send({ state: INITIAL[match[1]] });
            }
            if (req.method === 'PUT' && (match = req.url.match(/^\/api\/user\/lights\/(\d+)\/state$/))) {
                requests.push({ light: match[1], state: JSON.parse(body), at: Date.now() });
                return send([{ success: {} }]);
            }
            res.statusCode = 404;
            res.end();
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hue-test-'));
    configPath = path.join(dir, 'config.json');
    writeConfig({});
    process.env.TIKTOK_WIDGETS_CONFIG = configPath;

    hue = require('../src/modules/hueModule');
    hueEffects = require('../src/modules/hueEffects');
    configStore = require('../src/modules/configStore').getConfigStore();
});

test.after(() => {
    configStore.unwatch();
    server.close();
});

test.beforeEach(() => {
    requests = [];
});

function writeConfig(effects, enabled = true) {
    fs.writeFileSync(configPath, JSON.stringify({
        hue: {
            enabled,
            hubIp: `127.0.0.1:${server.address().port}`,
            username: 'user',
            clientkey: 'key',
            targetGroupId: '1',
            effects,
        },
    }));
}

const stripTimes = list => list.map(({ light, state }) => ({ light, state }));

test('legacy call shape and the new colors/gap shape send identical requests', async () => {
    await hue.fetchInitialGroupState('1');

    await hue.pulseGroupLights('1', { duration: 20, count: 2, color: [0.55, 0.45], brightnessIncrease: 300, transitionTime: 10 });
    const legacy = stripTimes(requests);
    requests = [];

    await hue.pulseGroupLights('1', { duration: 20, count: 2, colors: [[0.55, 0.45]], gap: 20, brightnessIncrease: 300, transitionTime: 10 });
    assert.deepEqual(stripTimes(requests), legacy);

    // pulse on (both lights), revert (both lights), twice
    assert.deepEqual(legacy, [
        { light: '1', state: { bri: 254, transitiontime: 10, xy: [0.55, 0.45] } },
        { light: '2', state: { bri: 254, transitiontime: 10, xy: [0.55, 0.45] } },
        { light: '1', state: { on: true, bri: 100, xy: [0.3, 0.3], transitiontime: 10 } },
        { light: '2', state: { on: true, bri: 200, xy: [0.4, 0.4], transitiontime: 10 } },
        { light: '1', state: { bri: 254, transitiontime: 10, xy: [0.55, 0.45] } },
        { light: '2', state: { bri: 254, transitiontime: 10, xy: [0.55, 0.45] } },
        { light: '1', state: { on: true, bri: 100, xy: [0.3, 0.3], transitiontime: 10 } },
        { light: '2', state: { on: true, bri: 200, xy: [0.4, 0.4], transitiontime: 10 } },
    ]);
});

test('colors cycle one per pulse and gap sets the pause between pulses', async () => {
    await hue.fetchInitialGroupState('1');
    await hue.pulseGroupLights('1', {
        duration: 10, gap: 150, count: 3, colors: [[0.1, 0.1], [0.2, 0.2]],
        brightnessIncrease: 10, transitionTime: 0,
    });

    const pulses = requests.filter(r => r.light === '1' && r.state.on === undefined);
    assert.deepEqual(pulses.map(r => r.state.xy), [[0.1, 0.1], [0.2, 0.2], [0.1, 0.1]]);
    assert.deepEqual(pulses.map(r => r.state.bri), [110, 110, 110]);

    const reverts = requests.filter(r => r.light === '1' && r.state.on !== undefined);
    const pause = pulses[1].at - reverts[0].at;
    assert.ok(pause >= 140, `expected ~150ms between pulses, got ${pause}ms`);
});

test('playEffect uses hue.effects from the live config file', async () => {
    writeConfig({ gift: { colors: ['#FF0000'], count: 1, duration: 10 } });
    assert.equal(configStore.reload(), true);

    const result = await hueEffects.playEffect('gift');
    assert.equal(result.played, true);
    const pulses = requests.filter(r => r.state.on === undefined);
    assert.equal(pulses.length, 2); // one pulse, two lights
    assert.deepEqual(pulses[0].state.xy, hueEffects.hexToXy('#FF0000'));
});

test('playEffect skips disabled effects unless forced, and respects hue.enabled', async () => {
    writeConfig({ gift: { enabled: false, count: 1, duration: 10 } });
    configStore.reload();
    assert.equal((await hueEffects.playEffect('gift')).played, false);
    assert.equal(requests.length, 0);

    assert.equal((await hueEffects.playEffect('gift', { force: true })).played, true);
    assert.ok(requests.length > 0);

    requests = [];
    writeConfig({ gift: { count: 1, duration: 10 } }, false);
    configStore.reload();
    const result = await hueEffects.playEffect('gift');
    assert.equal(result.played, false);
    assert.match(result.reason, /not enabled/);
    assert.equal(requests.length, 0);
});

test('a config file that fails to parse keeps the previous settings', () => {
    writeConfig({ gift: { count: 4 } });
    configStore.reload();
    fs.writeFileSync(configPath, '{ "hue": { broken');
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(configStore.reload(), false);
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(configStore.current.hue.effects.gift.count, 4);
});

test('the watcher picks up changes to config.json', async () => {
    writeConfig({ gift: { count: 2 } });
    configStore.reload();
    const originalLog = console.log;
    console.log = () => {};
    configStore.watch(50);
    try {
        const changed = new Promise(resolve => configStore.once('change', resolve));
        await new Promise(resolve => setTimeout(resolve, 100)); // let the watcher take its first stat
        writeConfig({ gift: { count: 9 } });
        await changed;
        assert.equal(configStore.current.hue.effects.gift.count, 9);
    } finally {
        configStore.unwatch();
        console.log = originalLog;
    }
});

test('light preview: shows the color, coalesces rapid updates, restores on stop', async () => {
    const { createPreviewController } = require('../src/modules/huePreview');
    await hue.fetchInitialGroupState('1');
    const preview = createPreviewController(hue);

    await preview.update('1', { xy: [0.1, 0.1], brightnessIncrease: 50 });
    // Rapid updates while the first is being applied: only the last one should be sent next
    await preview.update('1', { xy: [0.2, 0.2], brightnessIncrease: 50 });
    await preview.update('1', { xy: [0.3, 0.4], brightnessIncrease: 254 });
    await new Promise(resolve => setTimeout(resolve, 200));

    const shown = stripTimes(requests);
    assert.deepEqual(shown.slice(0, 2), [
        { light: '1', state: { on: true, xy: [0.1, 0.1], bri: 150, transitiontime: 2 } },
        { light: '2', state: { on: true, xy: [0.1, 0.1], bri: 250, transitiontime: 2 } },
    ]);
    assert.deepEqual(shown.slice(-2), [
        { light: '1', state: { on: true, xy: [0.3, 0.4], bri: 254, transitiontime: 2 } },
        { light: '2', state: { on: true, xy: [0.3, 0.4], bri: 254, transitiontime: 2 } },
    ]);
    assert.ok(!shown.some(r => r.state.xy && r.state.xy[0] === 0.2), 'intermediate update should be skipped');
    assert.equal(preview.isActive(), true);

    requests = [];
    assert.equal(await preview.stop(), true);
    assert.deepEqual(stripTimes(requests), [
        { light: '1', state: { on: true, bri: 100, xy: [0.3, 0.3], transitiontime: 4 } },
        { light: '2', state: { on: true, bri: 200, xy: [0.4, 0.4], transitiontime: 4 } },
    ]);
    assert.equal(preview.isActive(), false);
    assert.equal(await preview.stop(), false);
});

test('an effect played during a preview returns to the preview color', async () => {
    const { createPreviewController } = require('../src/modules/huePreview');
    await hue.fetchInitialGroupState('1');
    const preview = createPreviewController(hue);
    await preview.update('1', { xy: [0.6, 0.3], brightnessIncrease: 20 });
    await new Promise(resolve => setTimeout(resolve, 100));

    writeConfig({ gift: { count: 1, duration: 10, colors: [[0.1, 0.8]] } });
    configStore.reload();
    requests = [];
    await hueEffects.playEffect('gift', { preview });
    await new Promise(resolve => setTimeout(resolve, 100));

    const last = stripTimes(requests).slice(-2);
    assert.deepEqual(last.map(r => r.state.xy), [[0.6, 0.3], [0.6, 0.3]]);
    await preview.stop();
});

test('an idle preview restores the lights by itself', async () => {
    const { createPreviewController } = require('../src/modules/huePreview');
    await hue.fetchInitialGroupState('1');
    const preview = createPreviewController(hue, { idleTimeoutMs: 100 });
    const originalLog = console.log;
    console.log = () => {};
    try {
        await preview.update('1', { xy: [0.6, 0.3], brightnessIncrease: 20 });
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(preview.isActive(), false);
        assert.deepEqual(stripTimes(requests).slice(-1)[0].state, { on: true, bri: 200, xy: [0.4, 0.4], transitiontime: 4 });
    } finally {
        console.log = originalLog;
    }
});
