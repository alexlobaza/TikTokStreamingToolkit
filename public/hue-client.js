// hue-client.js - Client-side Hue light control
class HueClient {
    constructor(config) {
        this.config = config;
        this.bridgeIP = config.hue?.hubIp || '192.168.1.159';
        this.username = config.hue?.username || '';
        this.targetGroupId = config.hue?.targetGroupId || 1;
        this.enabled = config.hue?.enabled || false;
        
        if (this.enabled) {
            console.log('💡 Hue client initialized');
            console.log(`Bridge IP: ${this.bridgeIP}`);
            console.log(`Target Group: ${this.targetGroupId}`);
        }
    }

    /**
     * Make a request to the Hue bridge
     */
    async makeHueRequest(endpoint, method = 'GET', data = null) {
        if (!this.enabled) {
            console.log('💡 Hue is disabled');
            return;
        }

        try {
            const url = `http://${this.bridgeIP}/api/${this.username}${endpoint}`;
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            console.log(`💡 Making Hue request: ${method} ${url}`);
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Hue request failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('💡 Hue request successful:', result);
            return result;

        } catch (error) {
            console.error('💡 Hue request failed:', error);
            throw error;
        }
    }

    /**
     * Pulse group lights with specified options
     */
    async pulseGroupLights(targetGroupId, options = {}) {
        if (!this.enabled) return;

        const {
            duration = 100,
            count = 3,
            color = [0.67, 0.33], // Default blue
            brightnessIncrease = 100,
            transitionTime = 10
        } = options;

        console.log(`💡 Pulsing group lights: ${targetGroupId}, count: ${count}, duration: ${duration}ms`);

        try {
            // Store original state
            const originalState = await this.getGroupState(targetGroupId);
            
            // Pulse the lights
            for (let i = 0; i < count; i++) {
                // Turn on with increased brightness
                await this.setGroupState(targetGroupId, {
                    on: true,
                    bri: Math.min(254, (originalState.bri || 100) + brightnessIncrease),
                    xy: color,
                    transitiontime: transitionTime
                });

                // Wait for duration
                await this.sleep(duration);

                // Turn off
                await this.setGroupState(targetGroupId, {
                    on: false,
                    transitiontime: transitionTime
                });

                // Wait between pulses (except for last one)
                if (i < count - 1) {
                    await this.sleep(duration);
                }
            }

            // Restore original state
            await this.setGroupState(targetGroupId, originalState);

        } catch (error) {
            console.error('💡 Error pulsing group lights:', error);
        }
    }

    /**
     * Get current state of a group
     */
    async getGroupState(groupId) {
        try {
            const result = await this.makeHueRequest(`/groups/${groupId}`);
            return result.action || {};
        } catch (error) {
            console.error(`💡 Error getting group state: ${error}`);
            return {};
        }
    }

    /**
     * Set state of a group
     */
    async setGroupState(groupId, state) {
        try {
            await this.makeHueRequest(`/groups/${groupId}/action`, 'PUT', state);
        } catch (error) {
            console.error(`💡 Error setting group state: ${error}`);
        }
    }

    /**
     * Utility function to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Handle Hue triggers from server
     */
    handleHueTrigger(trigger) {
        console.log('💡 Received Hue trigger:', trigger);
        
        switch (trigger.action) {
            case 'pulseGroupLights':
                this.pulseGroupLights(trigger.targetGroupId, trigger.options);
                break;
            default:
                console.warn('💡 Unknown Hue action:', trigger.action);
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HueClient;
}
