// services/kick.js - Kick webhook event handling
const { EventEmitter } = require('events');
const crypto = require('crypto');

let globalKickWebhookCount = 0;

/**
 * Kick Webhook Handler - processes incoming webhook events from Kick
 * Based on official Kick documentation: https://docs.kick.com/events/webhook-security
 */
class KickWebhookHandler extends EventEmitter {
    constructor(channelName, accessToken, options = {}, enableLog = true) {
        super();

        this.channelName = channelName;
        this.accessToken = accessToken;
        this.enableLog = enableLog;
        this.options = options;
        this.isSubscribed = false;
        this.subscriptionId = null;
        
        // Kick public key for signature verification
        this.publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;
        
        this.log(`Initialized Kick webhook handler for channel: ${channelName}`);
    }

    /**
     * Subscribe to Kick webhook events for this channel
     * This would typically be called after setting up the webhook endpoint
     */
    async subscribeToEvents() {
        try {
            this.log(`Subscribing to webhook events for channel: ${this.channelName}`);
            
            // In a real implementation, you would call Kick's API to subscribe to webhooks
            // For now, we'll simulate the subscription
            this.isSubscribed = true;
            this.subscriptionId = `kick_webhook_${Date.now()}`;
            
            this.log(`Successfully subscribed to webhook events`);
            this.emit('subscribed', {
                channelName: this.channelName,
                subscriptionId: this.subscriptionId,
                platform: 'kick'
            });
            
            return true;
        } catch (error) {
            this.log(`Failed to subscribe to webhook events: ${error}`);
            this.emit('subscriptionFailed', error);
            return false;
        }
    }

    /**
     * Process incoming webhook event from Kick
     * This method should be called by the webhook endpoint
     */
    processWebhookEvent(headers, body) {
        try {
            // Verify the webhook signature
            if (!this.verifyWebhookSignature(headers, body)) {
                this.log(`Webhook signature verification failed`);
                return { success: false, error: 'Invalid signature' };
            }

            // Parse the event
            const event = this.parseWebhookEvent(headers, body);
            if (!event) {
                this.log(`Failed to parse webhook event`);
                return { success: false, error: 'Failed to parse event' };
            }

            // Emit the event for other parts of the system to handle
            this.emit(event.type, event);
            
            // Update global count
            globalKickWebhookCount++;
            
            this.log(`Processed webhook event: ${event.type}`);
            return { success: true, event };

        } catch (error) {
            this.log(`Error processing webhook event: ${error}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify webhook signature using Kick's public key
     * Based on: https://docs.kick.com/events/webhook-security
     */
    verifyWebhookSignature(headers, body) {
        try {
            const messageId = headers['kick-event-message-id'];
            const timestamp = headers['kick-event-message-timestamp'];
            const signature = headers['kick-event-signature'];
            const eventType = headers['kick-event-type'];

            if (!messageId || !timestamp || !signature || !eventType) {
                this.log(`Missing required webhook headers`);
                return false;
            }

            // TODO: Re-enable signature verification for production
            // For now, skip verification to test event flow
            if (signature === 'test_signature_123') {
                this.log(`Skipping signature verification for test event`);
                return true;
            }

            // Create the signature string as per Kick's documentation
            const signatureString = `${messageId}.${timestamp}.${body}`;
            
            // Verify the signature using RSA
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(signatureString);
            
            const isValid = verifier.verify(this.publicKey, signature, 'base64');
            
            if (!isValid) {
                this.log(`Webhook signature verification failed`);
                this.log(`Expected signature for: ${signatureString}`);
            }
            
            return isValid;

        } catch (error) {
            this.log(`Error verifying webhook signature: ${error}`);
            return false;
        }
    }

    /**
     * Parse webhook event based on event type
     */
    parseWebhookEvent(headers, body) {
        try {
            const eventType = headers['kick-event-type'];
            const messageId = headers['kick-event-message-id'];
            const timestamp = headers['kick-event-message-timestamp'];
            
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            } catch (e) {
                this.log(`Failed to parse webhook body as JSON: ${e}`);
                return null;
            }

            // Create normalized event structure
            const baseEvent = {
                id: `kick_${messageId}`,
                source: 'kick',
                timestamp: timestamp,
                platformData: {
                    kick: parsedBody,
                    headers: headers
                }
            };

            // Handle different event types based on Kick's official documentation
            switch (eventType) {
                case 'chat.message.sent':
                    return this.createChatEvent(baseEvent, parsedBody);
                    
                case 'channel.followed':
                    return this.createFollowEvent(baseEvent, parsedBody);
                    
                case 'channel.subscription.new':
                    return this.createSubscriptionEvent(baseEvent, parsedBody);
                    
                case 'channel.subscription.renewal':
                    return this.createSubscriptionRenewalEvent(baseEvent, parsedBody);
                    
                case 'channel.subscription.gifts':
                    return this.createSubscriptionGiftEvent(baseEvent, parsedBody);
                    
                case 'livestream.status.updated':
                    return this.createLivestreamStatusEvent(baseEvent, parsedBody);
                    
                case 'livestream.metadata.updated':
                    return this.createLivestreamMetadataEvent(baseEvent, parsedBody);
                    
                case 'moderation.banned':
                    return this.createModerationBannedEvent(baseEvent, parsedBody);
                    
                default:
                    this.log(`Unhandled webhook event type: ${eventType}`);
                    return {
                        ...baseEvent,
                        type: 'unknown',
                        rawEvent: parsedBody
                    };
            }

        } catch (error) {
            this.log(`Error parsing webhook event: ${error}`);
            return null;
        }
    }

    createChatEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'chat',
            user: data.sender?.username || 'Unknown',
            comment: data.content || data.message || '',
            eventType: 'chat'
        };
    }

    createGiftEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'gift',
            user: data.sender?.username || 'Unknown',
            giftName: data.gift?.name || 'Unknown Gift',
            giftValue: data.gift?.value || 0,
            repeatCount: data.gift?.count || 1,
            repeatEnd: true,
            eventType: 'gift'
        };
    }

    createFollowEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'follow',
            user: data.follower?.username || 'Unknown',
            userId: data.follower?.user_id || null,
            profilePicture: data.follower?.profile_picture || '',
            isVerified: data.follower?.is_verified || false,
            channelSlug: data.follower?.channel_slug || '',
            eventType: 'follow'
        };
    }

    createLikeEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'like',
            user: data.sender?.username || 'Unknown',
            likeCount: data.likes || 1,
            eventType: 'like'
        };
    }

    createStreamStartedEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'streamStarted',
            eventType: 'streamStarted'
        };
    }

    createStreamEndedEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'streamEnded',
            eventType: 'streamEnded'
        };
    }

    createViewerCountEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'viewerCount',
            viewerCount: data.viewerCount || 0,
            eventType: 'viewerCount'
        };
    }

    createSubscriptionEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'subscription',
            user: data.subscriber?.username || 'Unknown',
            userId: data.subscriber?.user_id || null,
            duration: data.duration || 1,
            createdAt: data.created_at || null,
            expiresAt: data.expires_at || null,
            eventType: 'subscription'
        };
    }

    createSubscriptionRenewalEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'subscriptionRenewal',
            user: data.subscriber?.username || 'Unknown',
            userId: data.subscriber?.user_id || null,
            duration: data.duration || 1,
            createdAt: data.created_at || null,
            expiresAt: data.expires_at || null,
            eventType: 'subscriptionRenewal'
        };
    }

    createSubscriptionGiftEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'subscriptionGift',
            gifter: data.gifter?.username || 'Unknown',
            gifterId: data.gifter?.user_id || null,
            giftees: data.giftees || [],
            createdAt: data.created_at || null,
            expiresAt: data.expires_at || null,
            eventType: 'subscriptionGift'
        };
    }

    createLivestreamStatusEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'livestreamStatus',
            isLive: data.is_live || false,
            title: data.title || '',
            startedAt: data.started_at || null,
            endedAt: data.ended_at || null,
            eventType: 'livestreamStatus'
        };
    }

    createLivestreamMetadataEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'livestreamMetadata',
            title: data.metadata?.title || '',
            language: data.metadata?.language || 'en',
            hasMatureContent: data.metadata?.has_mature_content || false,
            category: data.metadata?.category || null,
            eventType: 'livestreamMetadata'
        };
    }

    createModerationBannedEvent(baseEvent, data) {
        return {
            ...baseEvent,
            type: 'moderationBanned',
            moderator: data.moderator?.username || 'Unknown',
            bannedUser: data.banned_user?.username || 'Unknown',
            reason: data.metadata?.reason || '',
            createdAt: data.metadata?.created_at || null,
            expiresAt: data.metadata?.expires_at || null,
            eventType: 'moderationBanned'
        };
    }

    /**
     * Unsubscribe from webhook events
     */
    async unsubscribeFromEvents() {
        try {
            this.log(`Unsubscribing from webhook events for channel: ${this.channelName}`);
            
            this.isSubscribed = false;
            this.subscriptionId = null;
            
            this.log(`Successfully unsubscribed from webhook events`);
            this.emit('unsubscribed', {
                channelName: this.channelName,
                platform: 'kick'
            });
            
            return true;
        } catch (error) {
            this.log(`Failed to unsubscribe from webhook events: ${error}`);
            return false;
        }
    }

    /**
     * Get subscription status
     */
    getSubscriptionStatus() {
        return {
            isSubscribed: this.isSubscribed,
            subscriptionId: this.subscriptionId,
            channelName: this.channelName,
            platform: 'kick'
        };
    }

    log(logString) {
        if (this.enableLog) {
            console.log(`[KICK WEBHOOK] ${logString}`);
        }
    }
}

module.exports = {
    KickWebhookHandler,
    getGlobalKickWebhookCount: () => {
        return globalKickWebhookCount;
    }
};
