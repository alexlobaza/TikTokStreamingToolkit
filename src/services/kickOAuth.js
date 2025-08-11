// services/kickOAuth.js - Kick OAuth 2.0 authentication service
const crypto = require('crypto');
const axios = require('axios');

class KickOAuth {
    constructor(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
    }

    // Generate PKCE code verifier and challenge
    generatePKCE() {
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');
        
        return { codeVerifier, codeChallenge };
    }

    // Generate random state parameter for CSRF protection
    generateState() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Generate OAuth authorization URL
    getAuthorizationUrl() {
        const { codeVerifier, codeChallenge } = this.generatePKCE();
        const state = this.generateState();
        
        // Store code verifier and state for later use
        this.codeVerifier = codeVerifier;
        this.state = state;
        
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            scope: 'chat:read chat:write livestream:read',
            state: state
        });

        return `https://id.kick.com/oauth/authorize?${params.toString()}`;
    }

    // Exchange authorization code for access token
    async exchangeCodeForToken(authorizationCode, state) {
        // Validate state parameter to prevent CSRF attacks
        if (state !== this.state) {
            throw new Error('Invalid state parameter - possible CSRF attack');
        }
        
        // Log the request data for debugging
        const requestData = {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            grant_type: 'authorization_code',
            code: authorizationCode,
            code_verifier: this.codeVerifier
        };
        
        console.log('🔍 Token exchange request data:', requestData);
        console.log('🔍 Code verifier exists:', !!this.codeVerifier);
        console.log('🔍 Code verifier length:', this.codeVerifier?.length || 0);
        
        try {
            // Kick OAuth expects form-encoded data, not JSON
            const formData = new URLSearchParams(requestData);
            
            const response = await axios.post('https://id.kick.com/oauth/token', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                expiresIn: response.data.expires_in
            };
        } catch (error) {
            if (error.response) {
                console.error('Error exchanging code for token:');
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
                console.error('Headers:', error.response.headers);
            } else {
                console.error('Error exchanging code for token:', error.message);
            }
            throw error;
        }
    }

    // Refresh access token
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            // Kick OAuth expects form-encoded data, not JSON
            const formData = new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken
            });

            const response = await axios.post('https://id.kick.com/oauth/token', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                expiresIn: response.data.expires_in
            };
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            throw error;
        }
    }

    // Check if token is expired
    isTokenExpired() {
        return !this.tokenExpiry || Date.now() >= this.tokenExpiry;
    }

    // Get current access token (refresh if needed)
    async getValidAccessToken() {
        if (this.isTokenExpired()) {
            await this.refreshAccessToken();
        }
        return this.accessToken;
    }

    // Make authenticated API request
    async makeAuthenticatedRequest(method, url, data = null) {
        const token = await this.getValidAccessToken();
        
        const config = {
            method,
            url,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error('Authenticated request failed:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = KickOAuth;
