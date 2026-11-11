const test = require('node:test');
const assert = require('node:assert/strict');

const { Lightboard, normalizePads, normalizeEffect, splitSides, restoreState } = require('../src/modules/lightboard');
const { hexToXy } = require('../src/modules/hueEffects');

const RED = hexToXy('#FF0000');
const BLUE = hexToXy('#0000FF');

// Zone 86: hallway lights 7, 8 and kitchen lights 3, 4, 15 (rooms 5 and 2)
function mockHue() {
    const lights = {
        '7': { on: false, bri: 130, colormode: 'xy', xy: [0.3, 0.3] },
        '8': { on: true, bri: 120, colormode: 'ct', ct: 366, xy: [0.4, 0.4] },
        '3': { on: false, bri: 143, colormode: 'hs', hue: 8000, sat: 140, xy: [0.5, 0.4] },
        '4': { on: false, bri: 143, colormode: 'xy', xy: [0.31, 0.32] },
        '15': { on: true, bri: 50, colormode: 'xy', xy: [0.2, 0.2] },
    };
    const groups = {
        '86': { type: 'Zone', lights: ['8', '7', '3', '15', '4'] },
        '5': { type: 'Room', lights: ['7', '8'] },
        '2': { type: 'Room', lights: ['3', '4', '15'] },
    };
    const calls = [];
    return {
        calls,
        lights,
        getGroupLights: async id => groups[id].lights,
        getLightState: async id => ({ ...lights[id] }),
        setLightState: async (id, state) => { calls.push({ id, state: { ...state }, at: Date.now() }); return []; },
        getAllGroups: async () => groups,
    };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pad = (overrides = {}, effect = {}) => normalizePads({ lightboard: { pads: [{ title: 'Test', ...overrides, effect }] } })[0];

test('pads get defaults, unique ids and sane values', () => {
    const pads = normalizePads({
        lightboard: {
            pads: [
                { id: 'a', title: 'Police', effect: { type: 'police', colors: ['#FF0000'] } },
                { id: 'a', effect: { type: 'nope', interval: 5, brightness: 999 } },
                null,
                { mode: 'timed', duration: 10, groupId: 86, effect: { type: 'colorCycle', interval: 3000 } },
            ],
        },
    });
    assert.equal(pads.length, 3);
    assert.deepEqual(pads.map(p => p.id), ['a', 'a-2', 'pad4']);
    assert.deepEqual(pads[0].effect.colors, ['#FF0000', '#0000FF']); // police always has two colors
    assert.equal(pads[0].effect.style, 'swap');
    assert.equal(pads[0].effect.split, 'rooms');
    assert.equal(pads[1].title, 'Pad 2');
    assert.equal(pads[2].title, 'Pad 4');
    assert.equal(pads[1].effect.type, 'solid');
    assert.equal(pads[1].effect.interval, 100);
    assert.equal(pads[1].effect.brightness, 254);
    assert.equal(pads[2].mode, 'timed');
    assert.equal(pads[2].duration, 1000);
    assert.equal(pads[2].groupId, '86');
    assert.equal(pads[2].effect.transitionTime, 30); // color cycle fades over the interval
    assert.deepEqual(normalizePads({}), []);
    assert.deepEqual(normalizePads({ lightboard: { pads: 'x' } }), []);
});

test('invalid colors are dropped, falling back to the defaults', () => {
    assert.deepEqual(normalizeEffect({ type: 'strobe', colors: ['nope', 7] }).colors, ['#FFFFFF']);
    assert.deepEqual(normalizeEffect({ type: 'solid', colors: ['#00FF00', 'nope'] }).colors, ['#00FF00']);
});

test('police sides keep rooms together, or alternate lights', () => {
    const rooms = [{ id: '5', lights: ['7', '8'] }, { id: '2', lights: ['3', '4', '15'] }];
    assert.deepEqual(splitSides(['8', '7', '3', '15', '4'], rooms, 'rooms'), [['3', '15', '4'], ['8', '7']]);
    assert.deepEqual(splitSides(['8', '7', '3', '15', '4'], rooms, 'alternate'), [['8', '3', '4'], ['7', '15']]);
    // A single room can't be split by room: alternate instead
    assert.deepEqual(splitSides(['3', '4', '15'], rooms, 'rooms'), [['3', '15'], ['4']]);
});

test('restoring follows the color mode each light was in', () => {
    assert.deepEqual(restoreState({ on: true, bri: 120, colormode: 'ct', ct: 366, xy: [0.4, 0.4] }),
        { on: true, transitiontime: 4, bri: 120, ct: 366 });
    assert.deepEqual(restoreState({ on: false, bri: 143, colormode: 'hs', hue: 8000, sat: 140 }),
        { on: false, transitiontime: 4, bri: 143, hue: 8000, sat: 140 });
    assert.deepEqual(restoreState({ on: false, bri: 1, colormode: 'xy', xy: [0.3, 0.3] }),
        { on: false, transitiontime: 4, bri: 1, xy: [0.3, 0.3] });
});

test('a solid pad sets every light, and stopping restores each one', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    const changes = [];
    board.on('change', state => changes.push(state.active && state.active.id));

    await board.start(pad({ id: 's' }, { type: 'solid', colors: ['#FF0000'], brightness: 200 }), '86');
    await sleep(20);
    assert.equal(hue.calls.length, 5);
    assert.ok(hue.calls.every(c => c.state.on === true && c.state.bri === 200 && c.state.xy[0] === RED[0]));

    hue.calls.length = 0;
    assert.equal(await board.stop(), true);
    assert.deepEqual(Object.fromEntries(hue.calls.map(c => [c.id, c.state])), {
        '8': restoreState(hue.lights['8']),
        '7': restoreState(hue.lights['7']),
        '3': restoreState(hue.lights['3']),
        '15': restoreState(hue.lights['15']),
        '4': restoreState(hue.lights['4']),
    });
    assert.equal(await board.stop(), false);
    assert.deepEqual(changes, ['s', null]);
});

test('police swap alternates colors between the two sides', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    await board.start(pad({}, { type: 'police', colors: ['#FF0000', '#0000FF'], interval: 100 }), '86');
    await sleep(260);
    await board.stop();

    const sends = hue.calls.filter(c => c.state.on === true && c.state.transitiontime === 0);
    const colorOf = id => sends.filter(c => c.id === id).map(c => (c.state.xy[0] === RED[0] ? 'R' : 'B'));
    // Kitchen (3 lights) is one side, hallway the other; they always show opposite colors
    assert.deepEqual(colorOf('3').slice(0, 3), ['R', 'B', 'R']);
    assert.deepEqual(colorOf('8').slice(0, 3), ['B', 'R', 'B']);
});

test('police flash uses the built-in alert, offsets the second side, and clears it on stop', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    await board.start(pad({}, { type: 'police', style: 'flash' }), '86');
    await sleep(650);
    const first = hue.calls.filter(c => c.state.alert === 'lselect');
    assert.equal(first.length, 5);
    const kitchen = first.filter(c => ['3', '4', '15'].includes(c.id));
    const hallway = first.filter(c => ['7', '8'].includes(c.id));
    assert.ok(hallway[0].at - kitchen[kitchen.length - 1].at >= 450, 'second side starts half a cycle later');

    hue.calls.length = 0;
    await board.stop();
    assert.equal(hue.calls.length, 5);
    assert.ok(hue.calls.every(c => c.state.alert === 'none'));
});

test('strobe flashes on and off', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    await board.start(pad({}, { type: 'strobe', colors: ['#FF0000', '#0000FF'], interval: 100 }), '86');
    await sleep(380);
    await board.stop();
    const light3 = hue.calls.filter(c => c.id === '3').slice(0, 4).map(c => c.state.on ? (c.state.xy[0] === RED[0] ? 'R' : 'B') : 'off');
    assert.deepEqual(light3, ['R', 'off', 'B', 'off']);
});

test('timed pads stop by themselves', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    const p = pad({ mode: 'timed', duration: 1000 }, { type: 'solid' });
    p.duration = 150; // below the config minimum, to keep the test fast
    const state = await board.start(p, '86');
    assert.ok(state.active.endsAt > state.active.startedAt);
    await sleep(300);
    assert.equal(board.state().active, null);
});

test('starting a pad stops the running one first', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    await board.start(pad({ id: 'one' }, { type: 'colorCycle', interval: 100 }), '86');
    await sleep(50);
    await board.start(pad({ id: 'two' }, { type: 'solid' }), '86');
    assert.equal(board.state().active.id, 'two');
    const restores = hue.calls.filter(c => c.state.transitiontime === 4 && c.state.on !== undefined && c.state.bri !== 254);
    assert.ok(restores.length >= 5, 'lights restored between pads');
    await board.stop();
});

test('pauseAlerts and reapplying a static pad after an alert', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    await board.start(pad({ pauseAlerts: true }, { type: 'solid', colors: ['#0000FF'] }), '86');
    assert.equal(board.isPausingAlerts(), true);
    await sleep(20);
    hue.calls.length = 0;
    board.reapplyIfActive();
    await sleep(20);
    assert.equal(hue.calls.length, 5);
    assert.ok(hue.calls.every(c => c.state.xy[0] === BLUE[0]));
    await board.stop();
    assert.equal(board.isPausingAlerts(), false);
});

test('alert light effects are skipped while a pad pauses them', async () => {
    const { playEffect } = require('../src/modules/hueEffects');
    const calls = [];
    const fakeHue = { hasInitialGroupState: () => true, pulseGroupLights: async () => { calls.push('pulse'); } };
    const config = { hue: { enabled: true, targetGroupId: '1' } };
    const preview = { reapplyIfActive() {} };

    let reapplied = 0;
    const paused = { isPausingAlerts: () => true, reapplyIfActive() { reapplied++; } };
    const result = await playEffect('gift', { config, hue: fakeHue, preview, lightboard: paused });
    assert.equal(result.played, false);
    assert.deepEqual(calls, []);

    const running = { isPausingAlerts: () => false, reapplyIfActive() { reapplied++; } };
    assert.equal((await playEffect('gift', { config, hue: fakeHue, preview, lightboard: running })).played, true);
    assert.deepEqual(calls, ['pulse']);
    assert.equal(reapplied, 1, 'the pad gets its look back after the alert');
});

// --- Custom sequences

const { splitInto } = require('../src/modules/lightboard');

test('sequences: sides, steps and "off" are normalized', () => {
    const effect = normalizeEffect({
        type: 'sequence', sides: 9, split: 'alternate',
        steps: [
            { duration: 10, colors: ['#FF0000', 'off', null, 'nope'] },
            { duration: 250, transitionTime: 3, colors: ['#00FF00'] },
            'junk',
        ],
    });
    assert.equal(effect.sides, 4);
    assert.equal(effect.split, 'alternate');
    assert.equal(effect.steps.length, 3);
    assert.deepEqual(effect.steps[0], { duration: 50, transitionTime: 0, colors: ['#FF0000', 'off', 'off', 'off'] });
    assert.deepEqual(effect.steps[1], { duration: 250, transitionTime: 3, colors: ['#00FF00', 'off', 'off', 'off'] });
    assert.deepEqual(effect.steps[2], { duration: 500, transitionTime: 0, colors: ['off', 'off', 'off', 'off'] });
    assert.deepEqual(effect.colors, ['#FF0000', '#00FF00']);

    const defaults = normalizeEffect({ type: 'sequence' });
    assert.equal(defaults.sides, 2);
    assert.deepEqual(defaults.steps.map(s => s.colors), [['#FF0000', '#0000FF'], ['#0000FF', '#FF0000']]);
});

test('lights split into any number of sides', () => {
    const rooms = [{ id: 'a', lights: ['1', '2', '3'] }, { id: 'b', lights: ['4', '5'] }, { id: 'c', lights: ['6'] }];
    const ids = ['1', '2', '3', '4', '5', '6'];
    assert.deepEqual(splitInto(ids, rooms, 'rooms', 1), [ids]);
    assert.deepEqual(splitInto(ids, rooms, 'rooms', 3), [['1', '2', '3'], ['4', '5'], ['6']]);
    assert.deepEqual(splitInto(ids, rooms, 'rooms', 2), [['1', '2', '3'], ['4', '5', '6']]);
    // more sides than rooms: deal lights out in turn
    assert.deepEqual(splitInto(ids, rooms, 'rooms', 4), [['1', '5'], ['2', '6'], ['3'], ['4']]);
    assert.deepEqual(splitInto(ids, rooms, 'alternate', 3), [['1', '4'], ['2', '5'], ['3', '6']]);
});

test('a sequence plays its steps in a loop, per side, skipping unchanged sides', async () => {
    const hue = mockHue();
    const board = new Lightboard(hue);
    const lightning = pad({}, {
        type: 'sequence', sides: 2, split: 'rooms', brightness: 200,
        steps: [
            { duration: 60, colors: ['#FF0000', '#0000FF'] },
            { duration: 60, colors: ['off', '#0000FF'] },   // side B unchanged: not resent
            { duration: 60, colors: ['#FF0000', 'off'] },
        ],
    });
    await board.start(lightning, '86');
    await sleep(400);
    await board.stop();

    const kitchen = hue.calls.filter(c => c.id === '3' && c.state.transitiontime === 0)
        .map(c => (c.state.on ? (c.state.xy[0] === RED[0] ? 'R' : 'B') : 'off'));
    const hallway = hue.calls.filter(c => c.id === '8' && c.state.transitiontime === 0)
        .map(c => (c.state.on ? (c.state.xy[0] === RED[0] ? 'R' : 'B') : 'off'));
    // Kitchen (3 lights) is side A, hallway side B. Looping from step 3 (red) back to step 1
    // (red) doesn't change side A, so its next command is step 2's "off"
    assert.deepEqual(kitchen.slice(0, 4), ['R', 'off', 'R', 'off']);
    assert.deepEqual(hallway.slice(0, 3), ['B', 'off', 'B']);
    // (restores at the end use each light's own brightness)
    assert.ok(hue.calls.filter(c => c.state.on === true && c.state.transitiontime === 0).every(c => c.state.bri === 200));
});
