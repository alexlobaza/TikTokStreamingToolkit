// modules/huePreview.js - Live light preview while editing effects
//
// While a preview is active, the target group is switched on and shows one color at an
// effect's peak brightness (baseline + brightnessIncrease, like a pulse). Updates are
// coalesced: while lights are being updated, only the most recent request is kept, so
// dragging a color picker never queues up more commands than the bridge can take.
// Stopping restores the baseline state; so does a long idle period, in case the editor
// went away without stopping.

const PREVIEW_TRANSITION = 2; // 200 ms, smooth but responsive
const RESTORE_TRANSITION = 4;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

function createPreviewController(hue, { idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = {}) {
    let active = false;
    let groupId = null;
    let lights = [];
    let desired = null;  // { xy, brightnessIncrease }
    let applying = null; // promise of the running update loop
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

    function pump() {
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
     */
    async function update(targetGroupId, { xy, brightnessIncrease }) {
        if (active && targetGroupId !== groupId) {
            await stop();
        }
        if (!active) {
            // The baseline must be captured before the lights are changed
            if (!hue.hasInitialGroupState()) {
                await hue.fetchInitialGroupState(targetGroupId);
            }
            lights = await hue.getGroupLights(targetGroupId);
            groupId = targetGroupId;
            active = true;
            console.log('[hue] Light preview started');
        }
        desired = { xy, brightnessIncrease };
        resetIdleTimer();
        pump().catch(error => console.error('Error updating light preview:', error.message));
    }

    /** Re-show the preview (after an effect reverted the lights to their baseline) */
    function reapplyIfActive() {
        if (active && desired) {
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
