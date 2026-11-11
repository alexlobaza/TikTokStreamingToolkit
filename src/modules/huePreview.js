// modules/huePreview.js - Live light preview while editing effects
//
// Two modes:
// - color: the group is switched on and holds one color at an effect's peak brightness
//   (baseline + brightnessIncrease). Updates are coalesced: while lights are being updated,
//   only the most recent request is kept, so dragging a color picker never queues up more
//   commands than the bridge can take.
// - effect: the whole pulse effect plays in a loop (with a short rest between runs), each
//   run using the latest settings, so edits to count, timing or colors show on the next run.
// Stopping restores the baseline state; so does a long idle period, in case the editor
// went away without stopping.

const PREVIEW_TRANSITION = 2; // 200 ms, smooth but responsive
const RESTORE_TRANSITION = 4;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const LOOP_REST_MS = 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createPreviewController(hue, { idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = {}) {
    let active = false;
    let groupId = null;
    let lights = [];
    let desired = null;  // { xy, brightnessIncrease } or { pulse: pulseGroupLights options }
    let applying = null; // promise of the running color update
    let looping = null;  // promise of the running effect loop
    let dirty = false;
    let idleTimer = null;

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            console.log('[hue] Light preview idle, restoring lights');
            stop().catch(error => console.error('Error ending light preview:', error.message));
        }, idleTimeoutMs);
        if (idleTimer.unref) idleTimer.unref();
    }

    // Effect mode: play the pulse effect over and over with the latest settings
    function loop() {
        if (looping) return looping;
        looping = (async () => {
            const keepGoing = () => active && Boolean(desired && desired.pulse);
            while (keepGoing()) {
                await hue.pulseGroupLights(groupId, { ...desired.pulse, shouldContinue: keepGoing });
                const restUntil = Date.now() + LOOP_REST_MS;
                while (keepGoing() && Date.now() < restUntil) {
                    await sleep(50);
                }
            }
        })().finally(() => {
            looping = null;
            // Switched to color mode while the effect was playing
            if (active && desired && !desired.pulse) {
                pump().catch(error => console.error('Error updating light preview:', error.message));
            }
        });
        return looping;
    }

    function pump() {
        if (desired && desired.pulse) return loop();
        if (applying) {
            dirty = true;
            return applying;
        }
        applying = (async () => {
            do {
                dirty = false;
                const target = desired;
                if (!active || !target) break;
                for (const lightId of lights) {
                    if (!active) break;
                    const base = hue.getInitialLightState(lightId);
                    const baseBrightness = base && typeof base.bri === 'number' ? base.bri : 127;
                    await hue.setLightState(lightId, {
                        on: true,
                        xy: target.xy,
                        bri: Math.min(254, Math.max(1, baseBrightness + target.brightnessIncrease)),
                        transitiontime: PREVIEW_TRANSITION,
                    });
                }
            } while (dirty && active);
        })().finally(() => {
            applying = null;
        });
        return applying;
    }

    /**
     * Start or update the preview. Resolves once the preview is set up; the lights are
     * updated in the background (errors are logged).
     * @param {object} target  { xy, brightnessIncrease } to hold a color, or { pulse } (options
     *                         for pulseGroupLights) to loop an effect
     */
    async function update(targetGroupId, target) {
        if (active && targetGroupId !== groupId) {
            await stop();
        }
        if (!active) {
            // The baseline must be captured before the lights are changed
            if (!hue.hasInitialGroupState(targetGroupId)) {
                await hue.fetchInitialGroupState(targetGroupId);
            }
            lights = await hue.getGroupLights(targetGroupId);
            groupId = targetGroupId;
            active = true;
            console.log('[hue] Light preview started');
        }
        desired = target.pulse ? { pulse: target.pulse } : { xy: target.xy, brightnessIncrease: target.brightnessIncrease };
        resetIdleTimer();
        pump().catch(error => console.error('Error updating light preview:', error.message));
    }

    /** Re-show the preview (after an effect reverted the lights to their baseline) */
    function reapplyIfActive() {
        // A looping effect puts itself back on its next run
        if (active && desired && !desired.pulse) {
            pump().catch(error => console.error('Error updating light preview:', error.message));
        }
    }

    /** End the preview and restore the baseline. Resolves to whether one was active. */
    async function stop() {
        if (!active) return false;
        active = false;
        desired = null;
        clearTimeout(idleTimer);
        if (applying) {
            await applying.catch(() => {});
        }
        if (looping) {
            await looping.catch(() => {}); // ends after the current pulse
        }
        for (const lightId of lights) {
            const base = hue.getInitialLightState(lightId);
            if (base) {
                await hue.setLightState(lightId, {
                    on: base.on,
                    bri: base.bri,
                    xy: base.xy,
                    transitiontime: RESTORE_TRANSITION,
                });
            }
        }
        console.log('[hue] Light preview ended, lights restored');
        return true;
    }

    return {
        update,
        stop,
        reapplyIfActive,
        isActive: () => active,
    };
}

let defaultController = null;

function getPreviewController() {
    if (!defaultController) {
        defaultController = createPreviewController(require('./hueModule'));
    }
    return defaultController;
}

module.exports = { createPreviewController, getPreviewController };
