// services/kickWebhookSubscription.js - Subscribe to Kick webhook events
const axios = require('axios');

class KickWebhookSubscription {
    constructor(accessToken, webhookUrl = null) {
        this.accessToken = accessToken;
        // Use environment variable for webhook URL, fallback to localhost for testing
        this.webhookUrl = webhookUrl || process.env.KICK_WEBHOOK_URL || 'http://localhost:8082';
        this.subscriptionId = null;
        
        console.log(`🔗 Webhook subscription initialized with URL: ${this.webhookUrl}`);
        
        // Warn if using localhost
        if (this.webhookUrl.includes('localhost')) {
            console.warn('⚠️  WARNING: Using localhost for webhooks. Kick cannot reach this URL!');
            console.warn('💡 Use ngrok or deploy to a public server for real webhook testing.');
        }
    }

    /**
     * Subscribe to Kick webhook events for a channel
     * Based on Kick's webhook subscription API
     */
    async subscribeToChannelEvents(channelName) {
        try {
            console.log(`🔗 Subscribing to webhook events for channel: ${channelName}`);
            
            // Kick webhook subscription endpoint
            const subscriptionData = {
                channel: channelName,
                webhook_url: `${this.webhookUrl}/webhook/kick`,
                events: [
                    'chat.message.sent',
                    'channel.followed',
                    'channel.subscription.new',
                    'channel.subscription.renewal',
                    'channel.subscription.gifts',
                    'livestream.status.updated',
                    'livestream.metadata.updated'
                ]
            };

            const response = await axios.post('https://api.kick.com/webhooks/subscribe', subscriptionData, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            this.subscriptionId = response.data.subscription_id;
            console.log(`✅ Successfully subscribed to webhook events for ${channelName}`);
            console.log(`Subscription ID: ${this.subscriptionId}`);
            
            return {
                success: true,
                subscriptionId: this.subscriptionId,
                channel: channelName
            };

        } catch (error) {
            console.error('❌ Failed to subscribe to webhook events:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Unsubscribe from webhook events
     */
    async unsubscribeFromEvents() {
        if (!this.subscriptionId) {
            console.log('No active subscription to unsubscribe from');
            return { success: true };
        }

        try {
            console.log(`🔗 Unsubscribing from webhook events: ${this.subscriptionId}`);
            
            const response = await axios.delete(`https://api.kick.com/webhooks/${this.subscriptionId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            console.log(`✅ Successfully unsubscribed from webhook events`);
            this.subscriptionId = null;
            
            return { success: true };

        } catch (error) {
            console.error('❌ Failed to unsubscribe from webhook events:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get current subscription status
     */
    async getSubscriptionStatus() {
        if (!this.subscriptionId) {
            return { status: 'not_subscribed' };
        }

        try {
            const response = await axios.get(`https://api.kick.com/webhooks/${this.subscriptionId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            return {
                status: 'active',
                subscriptionId: this.subscriptionId,
                details: response.data
            };

        } catch (error) {
            console.error('❌ Failed to get subscription status:', error.response?.data || error.message);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Test webhook endpoint connectivity
     */
    async testWebhookEndpoint() {
        try {
            console.log(`🔗 Testing webhook endpoint: ${this.baseUrl}/webhook/kick`);
            
            const response = await axios.post(`${this.baseUrl}/webhook/kick`, {
                test: true,
                timestamp: new Date().toISOString()
            }, {
                headers: {
                    'kick-event-message-id': 'test_webhook_123',
                    'kick-event-message-timestamp': new Date().toISOString(),
                    'kick-event-signature': 'test_signature_123',
                    'kick-event-type': 'test.connection',
                    'kick-event-version': '1'
                }
            });

            console.log(`✅ Webhook endpoint is accessible: ${response.status}`);
            return { success: true, status: response.status };

        } catch (error) {
            console.error('❌ Webhook endpoint test failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = KickWebhookSubscription;
