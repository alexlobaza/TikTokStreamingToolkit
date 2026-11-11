// modules/hueEffects.js - Configurable Hue light effects per stream event
//
// Defaults live in config/hue-effects.defaults.json (the values that used to be hard-coded
// in the websocket handler). config.json can override any of them, per event and per field,
// under `hue.effects`:
//
//   "hue": {
//     "enabled": true,
//     ...
//     "effects": {
//       "gift":   { "colors": ["#FFAA00", "#FF00AA"], "count": 5 },
//       "follow": { "enabled": false }
//     }
//   }
//
// Fields (all optional):
//   enabled             false turns the light effect for that event off
//   colors              list of colors, cycled one per pulse; "#RRGGBB" or Hue [x, y]
//   color               single color (shorthand for `colors: [color]`)
//   count               number of pulses (1-50)
//   duration            ms the lights stay lit for each pulse (0-10000)
//   gap                 ms between pulses (0-10000); defaults to `duration`
//   brightnessIncrease  brightness added on top of the lights' normal level (0-254 is
//                       the useful range; anything higher just means "full brightness")
//   transitionTime      fade time for each change, in Hue units of 100 ms (0-600)
//
// Missing or invalid fields fall back to the defaults, so existing configs without
// `hue.effects` behave exactly as before.
//
// `hue.lightUpWhenOff` (default true): lights that are off switch on for an effect and off
// again afterwards, so a streamer can stay in the dark and only light up on alerts. Set it to
// false to leave lights that are off alone (before this option, effects on off lights did nothing).
const DEFAULTS = require('../../config/hue-effects.defaults.json');
const { getConfigStore } = require('./configStore');

const LIGHT_EVENTS = Object.freeze(Object.fromEntries(
    Object.entries(DEFAULTS.events).map(([key, def]) => [key, Object.freeze({
        label: def.label,
        socketEvent: def.socketEvent,
    })])
));

const LIMITS = Object.freeze({
    count: [1, 50],
    duration: [0, 10000],
    gap: [0, 10000],
    brightnessIncrease: [0, 1000],
    transitionTime: [0, 600],
});

// --- Colors -----------------------------------------------------------------------------

/**
 * Convert "#RRGGBB" (or "#RGB") to Hue CIE xy, using the wide-gamut sRGB conversion
 * from the Philips Hue developer docs. The bridge maps the result into each lamp's gamut.
 */
function hexToXy(hex) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!match) return null;

    let digits = match[1];
    if (digits.length === 3) {
        digits = digits.split('').map(c => c + c).join('');
    }
    const [r, g, b] = [0, 2, 4]
        .map(i => parseInt(digits.slice(i, i + 2), 16) / 255)
        .map(v => (v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92));

    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;
    const sum = X + Y + Z;
    if (sum === 0) return null; // black is not a light color

    const round = v => Math.round(v * 10000) / 10000;
    return [round(X / sum), round(Y / sum)];
}

/** Accepts "#RRGGBB", "#RGB" or [x, y]; returns [x, y] or null if invalid. */
function normalizeColor(value) {
    if (typeof value === 'string') {
        return hexToXy(value);
    }
    if (Array.isArray(value) && value.length === 2 &&
        value.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) {
        return [value[0], value[1]];
    }
    return null;
}

// --- Effects ----------------------------------------------------------------------------

function clampNumber(value, [min, max], { integer = false } = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const clamped = Math.min(max, Math.max(min, value));
    return integer ? Math.round(clamped) : clamped;
}

/**
 * Merge an override (from config.json or a test request) onto a base effect.
 * @returns {{ effect: object, issues: string[] }}
 */
function mergeEffect(base, override, label = 'effect') {
    const effect = { ...base, colors: base.colors.map(c => [...c]) };
    const issues = [];

    if (override === undefined || override === null) {
        return { effect, issues };
    }
    if (typeof override !== 'object' || Array.isArray(override)) {
        issues.push(`${label}: expected an object, ignoring it`);
        return { effect, issues };
    }

    if (override.enabled !== undefined) {
        if (typeof override.enabled === 'boolean') {
            effect.enabled = override.enabled;
        } else {
            issues.push(`${label}.enabled: expected true or false`);
        }
    }

    const rawColors = override.colors !== undefined ? override.colors
        : override.color !== undefined ? [override.color]
        : undefined;
    if (rawColors !== undefined) {
        const colors = Array.isArray(rawColors) ? rawColors.map(normalizeColor) : [];
        const valid = colors.filter(Boolean);
        if (valid.length > 0) {
            effect.colors = valid;
        }
        if (valid.length !== colors.length || valid.length === 0) {
            issues.push(`${label}.colors: use "#RRGGBB" or [x, y] values`);
        }
    }

    for (const [field, integer] of [['count', true], ['duration', false], ['gap', false],
                                    ['brightnessIncrease', false], ['transitionTime', true]]) {
        if (override[field] === undefined) continue;
        const value = clampNumber(override[field], LIMITS[field], { integer });
        if (value === null) {
            issues.push(`${label}.${field}: expected a number`);
        } else {
            effect[field] = value;
        }
    }

    // Before `gap` existed, the pause between pulses always equalled `duration`.
    // Keep that relationship when only `duration` is overridden.
    if (override.gap === undefined && typeof override.duration === 'number' && Number.isFinite(override.duration)) {
        effect.gap = effect.duration;
    }

    return { effect, issues };
}

/**
 * The effective effect for an event: defaults, then `hue.effects.<event>` from config,
 * then an optional extra override (used to preview unsaved settings).
 * @returns {{ effect: object|null, issues: string[] }} effect is null for unknown events
 */
function resolveEffect(eventKey, hueConfig = {}, extraOverride) {
    const def = Object.prototype.hasOwnProperty.call(DEFAULTS.events, eventKey) ? DEFAULTS.events[eventKey] : null;
    if (!def) return { effect: null, issues: [`Unknown event "${eventKey}"`] };

    const effects = hueConfig && typeof hueConfig.effects === 'object' && hueConfig.effects !== null
        ? hueConfig.effects
        : {};
    const configured = Object.prototype.hasOwnProperty.call(effects, eventKey) ? effects[eventKey] : undefined;

    const fromConfig = mergeEffect(def.effect, configured, `hue.effects.${eventKey}`);
    const fromRequest = mergeEffect(fromConfig.effect, extraOverride, eventKey);
    return { effect: fromRequest.effect, issues: [...fromConfig.issues, ...fromRequest.issues] };
}

/** Options for hueModule.pulseGroupLights */
function toPulseOptions(effect) {
    return {
        count: effect.count,
        duration: effect.duration,
        gap: effect.gap,
        colors: effect.colors,
        brightnessIncrease: effect.brightnessIncrease,
        transitionTime: effect.transitionTime,
    };
}

// Warn about each config problem once per config version instead of on every event
let warned = new Set();
let watchingForChanges = false;
function warnOnce(issues) {
    if (!watchingForChanges) {
        watchingForChanges = true;
        getConfigStore().on('change', () => { warned = new Set(); });
    }
    for (const issue of issues) {
        if (!warned.has(issue)) {
            warned.add(issue);
            console.warn(`[hue] Invalid light effect setting, using default: ${issue}`);
        }
    }
}

/**
 * Play the light effect for an event using the current config.json.
 * @param {string} eventKey   gift | follow | subscribe | superFan | share
 * @param {object} [options]
 * @param {object} [options.override] effect fields to apply on top of the config (preview)
 * @param {boolean} [options.force]   play even if the effect is disabled (preview)
 * @param {boolean} [options.wait=true] false resolves once the effect has started
 * @param {object} [options.hue]      hue module (tests)
 * @param {object} [options.preview]  light preview controller (tests)
 * @param {object} [options.lightboard] lightboard (tests)
 * @param {object} [options.config]   config object instead of the live one (tests)
 * @returns {Promise<{ played: boolean, reason?: string, effect?: object }>}
 */
async function playEffect(eventKey, options = {}) {
    const config = options.config || getConfigStore().current;
    const hueConfig = (config && config.hue) || {};

    if (!hueConfig.enabled) {
        return { played: false, reason: 'Hue lights are not enabled in config' };
    }

    const { effect, issues } = resolveEffect(eventKey, hueConfig, options.override);
    if (!effect) {
        return { played: false, reason: issues[0] };
    }
    warnOnce(issues);

    if (!effect.enabled && !options.force) {
        return { played: false, reason: `Light effect for "${eventKey}" is disabled` };
    }

    const lightboard = options.lightboard || require('./lightboard').getLightboard();
    if (lightboard.isPausingAlerts() && !options.force) {
        return { played: false, reason: 'A lightboard pad that pauses alert lights is running' };
    }

    const groupId = hueConfig.targetGroupId;
    if (!groupId) {
        return { played: false, reason: 'Hue target group ID is not configured' };
    }

    const hue = options.hue || require('./hueModule');
    // Capture the baseline if Hue was switched on after startup or the alert group changed
    if (!hue.hasInitialGroupState(groupId)) {
        await hue.fetchInitialGroupState(groupId);
    }

    const preview = options.preview || require('./huePreview').getPreviewController();
    // A pulse ends by reverting to the baseline; put an active light preview back afterwards
    const pulse = hue.pulseGroupLights(groupId, {
        ...toPulseOptions(effect),
        // Lights that are off flash on for effects unless hue.lightUpWhenOff is false
        turnOnIfOff: hueConfig.lightUpWhenOff !== false,
    })
        .finally(() => {
            preview.reapplyIfActive();
            lightboard.reapplyIfActive();
        });
    if (options.wait === false) {
        pulse.catch(error => console.error(`Error pulsing lights for ${eventKey}:`, error.message));
    } else {
        await pulse;
    }
    return { played: true, effect };
}

module.exports = {
    DEFAULTS,
    LIGHT_EVENTS,
    LIMITS,
    hexToXy,
    normalizeColor,
    mergeEffect,
    resolveEffect,
    toPulseOptions,
    playEffect,
};
