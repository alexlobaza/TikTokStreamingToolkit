// modules/lightboard.js - A soundboard for lights
//
// Pads live in config.json under `hue.lightboard.pads` and are read when pressed, so edits
// apply without a restart. One pad runs at a time: starting a pad stops the running one.
// Stopping restores every light to the state it had when the pad started.
//
//   "hue": {
//     "lightboard": {
//       "pads": [
//         {
//           "id": "police",            unique id (generated from the position if missing)
//           "title": "Police",
//           "tileColor": "#2244FF",    button color on the board (defaults to the first effect color)
//           "groupId": "86",           Hue room/zone/entertainment area (default: hue.targetGroupId)
//           "mode": "toggle",          "toggle" (press to start/stop) or "timed"
//           "duration": 10000,         ms, for timed pads
//           "pauseAlerts": false,      skip alert light effects (gift, follow...) while active
//           "effect": {
//             "type": "police",        solid | strobe | colorCycle | breathe | police | sequence
//             "colors": ["#FF0000", "#0000FF"],
//             "brightness": 254,       1-254
//             "interval": 500,         ms per step (strobe, colorCycle, police swap)
//             "transitionTime": 0,     fade per change, in 100 ms units
//             "style": "swap",         police: "swap" (fast red/blue swaps) or "flash" (Hue's built-in flashing)
//             "split": "rooms"         police/sequence: "rooms" (sides by room) or "alternate" (every other light)
//           }
//         }
//       ]
//     }
//   }
//
// A "sequence" is a custom effect: the lights are split into 1-4 sides, and a list of steps
// sets each side's color (or "off") for a duration, with an optional fade. The steps repeat
// until the pad stops. Police lights, for example, are two sides and two steps:
//
//   "effect": { "type": "sequence", "sides": 2, "split": "rooms", "brightness": 254, "steps": [
//     { "duration": 500, "transitionTime": 0, "colors": ["#FF0000", "#0000FF"] },
//     { "duration": 500, "transitionTime": 0, "colors": ["#0000FF", "#FF0000"] } ] }
const { EventEmitter } = require('events');
const { normalizeColor } = require('./hueEffects');

const EFFECT_TYPES = ['solid', 'strobe', 'colorCycle', 'breathe', 'police', 'sequence'];

const EFFECT_DEFAULTS = {
    solid:      { colors: ['#FFFFFF'], interval: 1000, transitionTime: 4 },
    strobe:     { colors: ['#FFFFFF'], interval: 300, transitionTime: 0 },
    colorCycle: { colors: ['#FF0000', '#00FF00', '#0000FF'], interval: 2000, transitionTime: null }, // null: fade over the interval
    breathe:    { colors: ['#FF0000'], interval: 1000, transitionTime: 0 },
    police:     { colors: ['#FF0000', '#0000FF'], interval: 500, transitionTime: 0 },
    sequence:   { colors: ['#FF0000', '#0000FF'], interval: 500, transitionTime: 0 },
};

const SEQUENCE = {
    sides: [1, 4],
    maxSteps: 32,
    stepDuration: [50, 60000],
    defaultSteps: [
        { duration: 500, transitionTime: 0, colors: ['#FF0000', '#0000FF'] },
        { duration: 500, transitionTime: 0, colors: ['#0000FF', '#FF0000'] },
    ],
};

const LIMITS = {
    duration: [1000, 3600000],
    brightness: [1, 254],
    interval: [100, 60000],
    transitionTime: [0, 100],
};

// Hue's built-in "lselect" alert flashes for ~15 s; renew it before it ends
const ALERT_RENEW_MS = 14000;
// One built-in flash cycle is about a second; offset the second police side by half of it
const FLASH_HALF_CYCLE_MS = 500;
const RESTORE_TRANSITION = 4;

// --- Pads -------------------------------------------------------------------------------

function clamp(value, [min, max], fallback, integer = true) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const clamped = Math.min(max, Math.max(min, value));
    return integer ? Math.round(clamped) : clamped;
}

function normalizeEffect(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const type = EFFECT_TYPES.includes(input.type) ? input.type : 'solid';
    const defaults = EFFECT_DEFAULTS[type];

    let colors = Array.isArray(input.colors) ? input.colors.filter(c => normalizeColor(c)) : [];
    if (colors.length === 0 && input.color !== undefined && normalizeColor(input.color)) colors = [input.color];
    if (colors.length === 0) colors = [...defaults.colors];
    if (type === 'police' && colors.length === 1) colors = [colors[0], defaults.colors[1]];
    colors = colors.slice(0, 8);

    const interval = clamp(input.interval, LIMITS.interval, defaults.interval);
    const transitionTime = clamp(
        input.transitionTime, LIMITS.transitionTime,
        defaults.transitionTime === null ? Math.min(100, Math.round(interval / 100)) : defaults.transitionTime
    );

    const effect = {
        type,
        colors,
        brightness: clamp(input.brightness, LIMITS.brightness, 254),
        interval,
        transitionTime,
    };
    if (type === 'police') {
        effect.style = input.style === 'flash' ? 'flash' : 'swap';
        effect.split = input.split === 'alternate' ? 'alternate' : 'rooms';
    }
    if (type === 'sequence') {
        effect.sides = clamp(input.sides, SEQUENCE.sides, 2);
        effect.split = input.split === 'alternate' ? 'alternate' : 'rooms';
        const steps = Array.isArray(input.steps) && input.steps.length > 0 ? input.steps : SEQUENCE.defaultSteps;
        effect.steps = steps.slice(0, SEQUENCE.maxSteps).map(step => normalizeStep(step, effect.sides));
        // For the default tile color: the colors the sequence uses
        const used = [...new Set(effect.steps.flatMap(step => step.colors.filter(c => c !== 'off')))];
        effect.colors = used.length > 0 ? used.slice(0, 8) : ['#FFFFFF'];
        delete effect.interval;
    }
    return effect;
}

/** One sequence step: a color (or "off") per side, a duration and a fade */
function normalizeStep(raw, sides) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const list = Array.isArray(input.colors) ? input.colors : [];
    const colors = [];
    for (let i = 0; i < sides; i++) {
        const value = list[i];
        colors.push(value !== 'off' && value !== null && value !== undefined && normalizeColor(value) ? value : 'off');
    }
    return {
        duration: clamp(input.duration, SEQUENCE.stepDuration, 500),
        transitionTime: clamp(input.transitionTime, LIMITS.transitionTime, 0),
        colors,
    };
}

/** Pads from `hue.lightboard.pads`, with defaults filled in and unique ids */
function normalizePads(hueConfig) {
    const raw = hueConfig && hueConfig.lightboard && Array.isArray(hueConfig.lightboard.pads)
        ? hueConfig.lightboard.pads
        : [];
    const used = new Set();
    // Ids and default titles come from each pad's position in the list, so they stay put
    return raw
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => p && typeof p === 'object' && !Array.isArray(p))
        .map(({ p, index }) => {
            let id = typeof p.id === 'string' && p.id.trim() ? p.id.trim().slice(0, 64) : `pad${index + 1}`;
            while (used.has(id)) id = `${id}-${index + 1}`;
            used.add(id);
            const effect = normalizeEffect(p.effect);
            const tileColor = typeof p.tileColor === 'string' && normalizeColor(p.tileColor) ? p.tileColor
                : typeof effect.colors[0] === 'string' ? effect.colors[0] : '#888888';
            return {
                id,
                title: typeof p.title === 'string' && p.title.trim() ? p.title.trim().slice(0, 40) : `Pad ${index + 1}`,
                tileColor,
                groupId: p.groupId !== undefined && p.groupId !== null && String(p.groupId).trim() ? String(p.groupId) : null,
                mode: p.mode === 'timed' ? 'timed' : 'toggle',
                duration: clamp(p.duration, LIMITS.duration, 10000),
                pauseAlerts: p.pauseAlerts === true,
                effect,
            };
        });
}

/**
 * Split lights into `count` sides. "rooms" keeps each room on one side (balanced by light
 * count); with fewer rooms than sides, or "alternate", lights are dealt out in turn.
 */
function splitInto(lightIds, rooms, mode, count) {
    if (count <= 1) return [[...lightIds]];
    if (mode === 'rooms' && Array.isArray(rooms)) {
        const byRoom = new Map();
        for (const id of lightIds) {
            const room = rooms.find(r => Array.isArray(r.lights) && r.lights.includes(id));
            const key = room ? `room:${room.id}` : `light:${id}`;
            if (!byRoom.has(key)) byRoom.set(key, []);
            byRoom.get(key).push(id);
        }
        if (byRoom.size >= count) {
            const sides = Array.from({ length: count }, () => []);
            [...byRoom.values()]
                .sort((a, b) => b.length - a.length)
                .forEach(members => {
                    const smallest = sides.reduce((best, side, i) => (side.length < sides[best].length ? i : best), 0);
                    sides[smallest].push(...members);
                });
            return sides;
        }
    }
    return Array.from({ length: count }, (_, side) => lightIds.filter((_, i) => i % count === side));
}

/** Two sides for police lights */
function splitSides(lightIds, rooms, mode) {
    return splitInto(lightIds, rooms, mode, 2);
}

// --- Running pads -----------------------------------------------------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Restore body for a light, matching the color mode it was in */
function restoreState(saved) {
    const state = { on: saved.on, transitiontime: RESTORE_TRANSITION };
    if (typeof saved.bri === 'number') state.bri = saved.bri;
    if (saved.colormode === 'ct' && typeof saved.ct === 'number') state.ct = saved.ct;
    else if (saved.colormode === 'hs' && typeof saved.hue === 'number') { state.hue = saved.hue; state.sat = saved.sat; }
    else if (Array.isArray(saved.xy)) state.xy = saved.xy;
    return state;
}

class Lightboard extends EventEmitter {
    /**
     * @param {object} hue  hueModule-like: getGroupLights, getLightState, setLightState, getAllGroups
     */
    constructor(hue) {
        super();
        this.hue = hue;
        this.active = null;
        this.busy = Promise.resolve(); // serializes start/stop
    }

    state() {
        if (!this.active) return { active: null };
        const { pad, startedAt, endsAt } = this.active;
        return { active: { id: pad.id, title: pad.title, startedAt, endsAt } };
    }

    isPausingAlerts() {
        return Boolean(this.active && this.active.pad.pauseAlerts);
    }

    /** Start a (normalized) pad on a group, stopping whatever is running first */
    start(pad, groupId) {
        return this.serialize(async () => {
            await this.stopActive();

            const lights = (await this.hue.getGroupLights(groupId)).map(String);
            const saved = {};
            for (const id of lights) {
                saved[id] = await this.hue.getLightState(id);
            }

            let sides = null;
            if (pad.effect.type === 'police' || pad.effect.type === 'sequence') {
                const count = pad.effect.type === 'police' ? 2 : pad.effect.sides;
                let rooms = [];
                if (pad.effect.split === 'rooms' && count > 1) {
                    const groups = await this.hue.getAllGroups();
                    rooms = Object.entries(groups)
                        .filter(([, g]) => g.type === 'Room')
                        .map(([id, g]) => ({ id, lights: (g.lights || []).map(String) }));
                }
                sides = splitInto(lights, rooms, pad.effect.split, count);
            }

            const run = {
                pad,
                groupId,
                lights,
                saved,
                sides,
                xy: pad.effect.colors.map(normalizeColor),
                cancelled: false,
                startedAt: Date.now(),
                endsAt: pad.mode === 'timed' ? Date.now() + pad.duration : null,
                timer: null,
                loop: null,
            };
            this.active = run;
            run.loop = this.runEffect(run).catch(error => {
                console.error(`[lightboard] Error running "${pad.title}":`, error.message);
            });
            if (run.endsAt) {
                run.timer = setTimeout(() => {
                    if (this.active === run) {
                        this.stop().catch(error => console.error('[lightboard] Error stopping pad:', error.message));
                    }
                }, pad.duration);
                if (run.timer.unref) run.timer.unref();
            }
            console.log(`[lightboard] Started "${pad.title}"`);
            this.emit('change', this.state());
            return this.state();
        });
    }

    /** Stop the running pad and restore the lights. Resolves to whether one was running. */
    stop() {
        return this.serialize(() => this.stopActive());
    }

    /** After an alert effect reverted the lights, put a static pad's look back */
    reapplyIfActive() {
        const run = this.active;
        if (!run || run.cancelled) return;
        const { type, style } = run.pad.effect;
        if (type === 'sequence') {
            run.lastSent = []; // resend every side on the next step
        }
        if (type === 'solid' || type === 'breathe' || (type === 'police' && style === 'flash')) {
            this.applyStatic(run).catch(error => console.error('[lightboard] Error reapplying pad:', error.message));
        }
    }

    // --- internals

    serialize(task) {
        const next = this.busy.then(task, task);
        this.busy = next.catch(() => {});
        return next;
    }

    async stopActive() {
        const run = this.active;
        if (!run) return false;
        run.cancelled = true;
        clearTimeout(run.timer);
        this.active = null;
        await run.loop;

        const usesAlert = run.pad.effect.type === 'breathe' || (run.pad.effect.type === 'police' && run.pad.effect.style === 'flash');
        for (const id of run.lights) {
            const saved = run.saved[id];
            if (!saved) continue;
            const state = restoreState(saved);
            if (usesAlert) state.alert = 'none';
            await this.hue.setLightState(id, state).catch(() => {});
        }
        console.log(`[lightboard] Stopped "${run.pad.title}", lights restored`);
        this.emit('change', this.state());
        return true;
    }

    async send(run, ids, state) {
        for (const id of ids) {
            if (run.cancelled) return;
            await this.hue.setLightState(id, state).catch(() => {});
        }
    }

    /** Wait `ms`, waking early if the pad is cancelled */
    async wait(run, ms) {
        const end = Date.now() + ms;
        while (!run.cancelled && Date.now() < end) {
            await sleep(Math.min(50, end - Date.now()));
        }
    }

    async applyStatic(run) {
        const { type, brightness } = run.pad.effect;
        const tt = run.pad.effect.transitionTime;
        if (type === 'solid') {
            await this.send(run, run.lights, { on: true, xy: run.xy[0], bri: brightness, transitiontime: tt });
        } else if (type === 'breathe') {
            await this.send(run, run.lights, { on: true, xy: run.xy[0], bri: brightness, transitiontime: 0, alert: 'lselect' });
        } else if (type === 'police') {
            const [a, b] = run.sides;
            await this.send(run, a, { on: true, xy: run.xy[0], bri: brightness, transitiontime: 0, alert: 'lselect' });
            await this.wait(run, FLASH_HALF_CYCLE_MS);
            await this.send(run, b, { on: true, xy: run.xy[1], bri: brightness, transitiontime: 0, alert: 'lselect' });
        }
    }

    async runEffect(run) {
        const effect = run.pad.effect;
        const { brightness, interval } = effect;

        if (effect.type === 'solid') {
            await this.applyStatic(run);
            return;
        }

        if (effect.type === 'breathe' || (effect.type === 'police' && effect.style === 'flash')) {
            // Built-in flashing lasts ~15 s per command; renew it until stopped
            while (!run.cancelled) {
                await this.applyStatic(run);
                await this.wait(run, ALERT_RENEW_MS);
            }
            return;
        }

        if (effect.type === 'sequence') {
            await this.runSequence(run);
            return;
        }

        // Stepped effects: never faster than the bridge can take (each step sends one
        // command per light), so a short interval just runs as fast as possible
        for (let step = 0; !run.cancelled; step++) {
            const began = Date.now();
            if (effect.type === 'police') {
                const [a, b] = run.sides;
                const first = run.xy[step % 2];
                const second = run.xy[(step + 1) % 2];
                await this.send(run, a, { on: true, xy: first, bri: brightness, transitiontime: effect.transitionTime });
                await this.send(run, b, { on: true, xy: second, bri: brightness, transitiontime: effect.transitionTime });
            } else if (effect.type === 'strobe') {
                const color = run.xy[Math.floor(step / 2) % run.xy.length];
                const state = step % 2 === 0
                    ? { on: true, xy: color, bri: brightness, transitiontime: 0 }
                    : { on: false, transitiontime: 0 };
                await this.send(run, run.lights, state);
            } else if (effect.type === 'colorCycle') {
                await this.send(run, run.lights, {
                    on: true, xy: run.xy[step % run.xy.length], bri: brightness, transitiontime: effect.transitionTime,
                });
            }
            await this.wait(run, Math.max(0, interval - (Date.now() - began)));
        }
    }
}

// Lightboard.prototype is extended here to keep the sequence runner next to its docs
/**
 * Custom sequence: each step sets every side's color (or off), then waits its duration.
 * Sides whose state doesn't change from the previous step are skipped, which saves bridge
 * commands (each light command takes ~70 ms, so long steps on many lights run slower).
 */
Lightboard.prototype.runSequence = async function runSequence(run) {
    const { brightness } = run.pad.effect;
    const steps = run.pad.effect.steps.map(step => ({
        ...step,
        xy: step.colors.map(color => (color === 'off' ? null : normalizeColor(color))),
    }));
    run.lastSent = [];
    for (let index = 0; !run.cancelled; index++) {
        const step = steps[index % steps.length];
        const began = Date.now();
        for (let side = 0; side < run.sides.length; side++) {
            const xy = step.xy[side];
            const state = xy
                ? { on: true, xy, bri: brightness, transitiontime: step.transitionTime }
                : { on: false, transitiontime: step.transitionTime };
            const key = JSON.stringify(state);
            if (run.lastSent[side] === key) continue;
            await this.send(run, run.sides[side], state);
            run.lastSent[side] = key;
        }
        await this.wait(run, Math.max(0, step.duration - (Date.now() - began)));
    }
};

let defaultLightboard = null;

function getLightboard() {
    if (!defaultLightboard) {
        defaultLightboard = new Lightboard(require('./hueModule'));
    }
    return defaultLightboard;
}

module.exports = {
    EFFECT_TYPES,
    LIMITS,
    Lightboard,
    getLightboard,
    normalizeEffect,
    normalizePads,
    SEQUENCE,
    splitInto,
    splitSides,
    restoreState,
};
