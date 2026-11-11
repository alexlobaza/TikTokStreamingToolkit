const test = require('node:test');
const assert = require('node:assert/strict');

const {
    LIGHT_EVENTS, hexToXy, normalizeColor, resolveEffect, toPulseOptions,
} = require('../src/modules/hueEffects');

// The parameters that were hard-coded in src/handlers/websocket.js before effects became
// configurable. With no `hue.effects` in config.json, behavior must be identical.
const LEGACY = {
    subscribe: { duration: 150, count: 10, color: [0.67, 0.33], brightnessIncrease: 400, transitionTime: 10 },
    follow:    { duration: 100, count: 4,  color: [0.45, 0.41], brightnessIncrease: 300, transitionTime: 10 },
    gift:      { duration: 100, count: 3,  color: [0.55, 0.45], brightnessIncrease: 300, transitionTime: 10 },
    share:     { duration: 100, count: 2,  color: [0.5, 0.5],   brightnessIncrease: 300, transitionTime: 10 },
};

test('defaults reproduce the legacy hard-coded effects', () => {
    for (const [eventKey, legacy] of Object.entries(LEGACY)) {
        for (const hueConfig of [{}, { effects: {} }, { effects: null }, undefined]) {
            const { effect, issues } = resolveEffect(eventKey, hueConfig);
            assert.deepEqual(issues, []);
            assert.equal(effect.enabled, true, eventKey);
            assert.deepEqual(toPulseOptions(effect), {
                count: legacy.count,
                duration: legacy.duration,
                gap: legacy.duration, // legacy: pause between pulses == duration
                colors: [legacy.color],
                brightnessIncrease: legacy.brightnessIncrease,
                transitionTime: legacy.transitionTime,
            }, eventKey);
        }
    }
});

test('socket event names match what public/app.js emits', () => {
    assert.deepEqual(
        Object.fromEntries(Object.entries(LIGHT_EVENTS).map(([k, v]) => [k, v.socketEvent])),
        {
            gift: 'giftLights',
            follow: 'newFollowerLights',
            subscribe: 'subscribeLights',
            superFan: 'superFanLights',
            share: 'shareLights',
        }
    );
});

test('super fan has an effect, off by default (it had no lights before)', () => {
    assert.equal(resolveEffect('superFan', {}).effect.enabled, false);
    assert.equal(resolveEffect('superFan', { effects: { superFan: { enabled: true } } }).effect.enabled, true);
});

test('unknown events are rejected, including object prototype keys', () => {
    for (const key of ['nope', 'constructor', '__proto__', 'toString']) {
        assert.equal(resolveEffect(key, {}).effect, null, key);
    }
});

test('overrides apply per field and keep the other defaults', () => {
    const { effect, issues } = resolveEffect('gift', {
        effects: { gift: { count: 7, colors: ['#FF0000', [0.2, 0.3]], brightnessIncrease: 120 } },
    });
    assert.deepEqual(issues, []);
    assert.equal(effect.count, 7);
    assert.equal(effect.brightnessIncrease, 120);
    assert.deepEqual(effect.colors, [hexToXy('#FF0000'), [0.2, 0.3]]);
    assert.equal(effect.duration, 100);
    assert.equal(effect.gap, 100);
    assert.equal(effect.transitionTime, 10);
});

test('`color` works as shorthand for a single color', () => {
    const { effect } = resolveEffect('share', { effects: { share: { color: '#00FF00' } } });
    assert.deepEqual(effect.colors, [hexToXy('#00FF00')]);
});

test('gap follows duration unless set explicitly', () => {
    assert.equal(resolveEffect('gift', { effects: { gift: { duration: 300 } } }).effect.gap, 300);
    assert.equal(resolveEffect('gift', { effects: { gift: { duration: 300, gap: 50 } } }).effect.gap, 50);
    assert.equal(resolveEffect('gift', { effects: { gift: { gap: 50 } } }).effect.duration, 100);
});

test('invalid values fall back to defaults and are reported', () => {
    const { effect, issues } = resolveEffect('follow', {
        effects: { follow: { count: 'lots', colors: ['not a color'], enabled: 'yes', duration: null } },
    });
    const defaults = resolveEffect('follow', {}).effect;
    assert.equal(effect.count, defaults.count);
    assert.deepEqual(effect.colors, defaults.colors);
    assert.equal(effect.enabled, defaults.enabled);
    assert.equal(effect.duration, defaults.duration);
    assert.equal(issues.length, 4);
});

test('a non-object effect override is ignored', () => {
    const { effect, issues } = resolveEffect('gift', { effects: { gift: 'loud' } });
    assert.deepEqual(effect, resolveEffect('gift', {}).effect);
    assert.equal(issues.length, 1);
});

test('numbers are clamped to sensible ranges', () => {
    const { effect } = resolveEffect('gift', {
        effects: { gift: { count: 1000, duration: -5, transitionTime: 2.6 } },
    });
    assert.equal(effect.count, 50);
    assert.equal(effect.duration, 0);
    assert.equal(effect.transitionTime, 3);
});

test('a preview override is applied on top of config', () => {
    const { effect } = resolveEffect(
        'gift',
        { effects: { gift: { count: 5, colors: ['#0000FF'] } } },
        { count: 2 }
    );
    assert.equal(effect.count, 2);
    assert.deepEqual(effect.colors, [hexToXy('#0000FF')]);
});

test('resolving does not mutate the shared defaults', () => {
    const before = JSON.stringify(resolveEffect('gift', {}).effect);
    const { effect } = resolveEffect('gift', {});
    effect.colors[0][0] = 0.99;
    effect.count = 42;
    assert.equal(JSON.stringify(resolveEffect('gift', {}).effect), before);
});

test('hex to xy matches the Philips reference conversion', () => {
    const close = (actual, expected) => {
        assert.ok(Math.abs(actual[0] - expected[0]) < 0.001 && Math.abs(actual[1] - expected[1]) < 0.001,
            `${actual} vs ${expected}`);
    };
    close(hexToXy('#FF0000'), [0.7006, 0.2993]);
    close(hexToXy('#00FF00'), [0.1724, 0.7468]);
    close(hexToXy('#0000FF'), [0.1355, 0.0399]);
    close(hexToXy('#FFFFFF'), [0.3227, 0.329]);
    assert.deepEqual(hexToXy('#f00'), hexToXy('#FF0000'));
    assert.deepEqual(hexToXy('ff0000'), hexToXy('#FF0000'));
});

test('invalid colors are rejected', () => {
    for (const value of ['#000000', '#GGGGGG', 'red', '', [0.5], [0.5, 2], ['a', 'b'], 12, null, {}]) {
        assert.equal(normalizeColor(value), null, JSON.stringify(value));
    }
});
