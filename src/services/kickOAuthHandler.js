// services/kickOAuthHandler.js - Complete OAuth flow handler
const KickOAuth = require('./kickOAuth');
const express = require('express');
const axios = require('axios');

class KickOAuthHandler {
    constructor(clientId, clientSecret, baseUrl = 'http://localhost:8082') {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.baseUrl = baseUrl;
        this.redirectUri = `${baseUrl}/oauth/kick/callback`;
        this.oauth = null;
        this.pendingAuths = new Map(); // Store pending authorizations
    }

    // Generate authorization URL and store pending auth
    generateAuthUrl() {
        this.oauth = new KickOAuth(this.clientId, this.clientSecret, this.redirectUri);
        const authUrl = this.oauth.getAuthorizationUrl();
        
        // Store pending authorization
        const authId = this.oauth.state;
        this.pendingAuths.set(authId, {
            oauth: this.oauth,
            timestamp: Date.now(),
            status: 'pending'
        });

        // Clean up old pending auths (older than 10 minutes)
        this.cleanupPendingAuths();

        return {
            authUrl,
            authId,
            state: this.oauth.state,
            codeVerifier: this.oauth.codeVerifier
        };
    }

    // Handle OAuth callback
    async handleCallback(code, state, error = null) {
        if (error) {
            throw new Error(`OAuth error: ${error}`);
        }

        const pendingAuth = this.pendingAuths.get(state);
        if (!pendingAuth) {
            throw new Error('Invalid or expired authorization request');
        }

        if (pendingAuth.status !== 'pending') {
            throw new Error('Authorization already processed');
        }

        try {
            // Mark as processing
            pendingAuth.status = 'processing';

            // Ensure the OAuth instance has the correct state and code_verifier
            pendingAuth.oauth.state = state;
            
            // Exchange code for token
            const result = await pendingAuth.oauth.exchangeCodeForToken(code, state);
            
            // Mark as completed
            pendingAuth.status = 'completed';
            pendingAuth.result = result;

            return result;
        } catch (error) {
            // Mark as failed
            pendingAuth.status = 'failed';
            pendingAuth.error = error.message;
            
            // Log detailed error information
            console.error('OAuth callback error:', {
                state,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            
            throw error;
        }
    }

    // Get auth status
    getAuthStatus(authId) {
        const pendingAuth = this.pendingAuths.get(authId);
        if (!pendingAuth) {
            return { status: 'not_found' };
        }

        return {
            status: pendingAuth.status,
            timestamp: pendingAuth.timestamp,
            result: pendingAuth.result,
            error: pendingAuth.error
        };
    }

    // Clean up old pending authorizations
    cleanupPendingAuths() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes

        for (const [authId, auth] of this.pendingAuths.entries()) {
            if (now - auth.timestamp > maxAge) {
                this.pendingAuths.delete(authId);
            }
        }
    }

    // Create Express routes for OAuth flow
    createRoutes(app) {
        // OAuth initiation endpoint (GET - for direct browser access)
        app.get('/oauth/kick/start', (req, res) => {
            try {
                const authInfo = this.generateAuthUrl();
                
                // Return a beautiful HTML page instead of JSON
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Kick OAuth - Start</title>
                        <style>
                            body { 
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                margin: 0; padding: 0; min-height: 100vh;
                                display: flex; align-items: center; justify-content: center;
                            }
                            .container {
                                background: white; border-radius: 20px; padding: 40px;
                                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                                text-align: center; max-width: 500px; width: 90%;
                            }
                            .logo { font-size: 48px; margin-bottom: 20px; }
                            h1 { color: #333; margin-bottom: 30px; font-weight: 300; }
                            .auth-url {
                                background: #f8f9fa; padding: 20px; border-radius: 10px;
                                margin: 20px 0; word-break: break-all; font-family: monospace;
                                font-size: 12px; border: 1px solid #e9ecef;
                            }
                            .btn {
                                background: #667eea; color: white; padding: 15px 30px;
                                border: none; border-radius: 10px; font-size: 16px;
                                cursor: pointer; text-decoration: none; display: inline-block;
                                margin: 10px; transition: all 0.3s ease;
                            }
                            .btn:hover { background: #5a6fd8; transform: translateY(-2px); }
                            .btn-secondary {
                                background: #6c757d; color: white;
                            }
                            .btn-secondary:hover { background: #5a6268; }
                            .info {
                                background: #e3f2fd; border: 1px solid #bbdefb;
                                padding: 15px; border-radius: 8px; margin: 20px 0;
                                color: #1976d2;
                            }
                            .status { margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="logo">🚀</div>
                            <h1>Kick OAuth Authorization</h1>
                            
                            <div class="info">
                                <strong>Step 1:</strong> Click the button below to authorize your app with Kick
                            </div>
                            
                            <a href="${authInfo.authUrl}" class="btn" target="_blank">
                                🔐 Authorize with Kick
                            </a>
                            
                            <div class="status">
                                <p><strong>Auth ID:</strong> <code>${authInfo.authId}</code></p>
                                <p><strong>Status:</strong> <span id="status">Pending...</span></p>
                            </div>
                            
                            <div style="margin-top: 30px;">
                                <button class="btn btn-secondary" onclick="checkStatus()">
                                    🔄 Check Status
                                </button>
                                <button class="btn btn-secondary" onclick="window.close()">
                                    ❌ Close
                                </button>
                            </div>
                        </div>
                        
                        <script>
                            let checkInterval;
                            
                            function checkStatus() {
                                fetch('/oauth/kick/status/${authInfo.authId}')
                                    .then(response => response.json())
                                    .then(data => {
                                        const statusEl = document.getElementById('status');
                                        if (data.status === 'completed') {
                                            statusEl.innerHTML = '✅ <strong>Success!</strong> OAuth completed.';
                                            statusEl.style.color = '#28a745';
                                            clearInterval(checkInterval);
                                        } else if (data.status === 'failed') {
                                            statusEl.innerHTML = '❌ <strong>Failed:</strong> ' + data.error;
                                            statusEl.style.color = '#dc3545';
                                            clearInterval(checkInterval);
                                        } else if (data.status === 'processing') {
                                            statusEl.innerHTML = '⏳ Processing...';
                                            statusEl.style.color = '#ffc107';
                                        } else {
                                            statusEl.innerHTML = '⏳ Pending...';
                                            statusEl.style.color = '#6c757d';
                                        }
                                    })
                                    .catch(error => {
                                        document.getElementById('status').innerHTML = '❌ Error checking status';
                                    });
                            }
                            
                            // Auto-check status every 2 seconds
                            checkInterval = setInterval(checkStatus, 2000);
                            
                            // Initial check
                            checkStatus();
                        </script>
                    </body>
                    </html>
                `);
            } catch (error) {
                res.status(500).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>OAuth Error</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1 style="color: #dc3545;">❌ OAuth Error</h1>
                        <p>Error: ${error.message}</p>
                    </body>
                    </html>
                `);
            }
        });

        // OAuth callback endpoint
        app.get('/oauth/kick/callback', async (req, res) => {
            try {
                const { code, state, error } = req.query;

                if (error) {
                    res.status(400).json({
                        success: false,
                        error: `OAuth error: ${error}`
                    });
                    return;
                }

                if (!code || !state) {
                    res.status(400).json({
                        success: false,
                        error: 'Missing code or state parameter'
                    });
                    return;
                }

                const result = await this.handleCallback(code, state);
                
                // Return success page
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>OAuth Success</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .success { color: #28a745; }
                            .info { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <h1 class="success">✅ OAuth Successful!</h1>
                        <div class="info">
                            <p><strong>Access Token:</strong> ${result.accessToken ? '✅ Received' : '❌ Missing'}</p>
                            <p><strong>Refresh Token:</strong> ${result.refreshToken ? '✅ Received' : '❌ Missing'}</p>
                            <p><strong>Expires In:</strong> ${result.expiresIn} seconds</p>
                        </div>
                        <p>You can now close this window and return to your app.</p>
                        <script>
                            // Auto-close after 5 seconds
                            setTimeout(() => window.close(), 5000);
                        </script>
                    </body>
                    </html>
                `);

            } catch (error) {
                res.status(500).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>OAuth Error</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #dc3545; }
                        </style>
                    </head>
                    <body>
                        <h1 class="error">❌ OAuth Failed</h1>
                        <p>Error: ${error.message}</p>
                        <p>Please try again or contact support.</p>
                    </body>
                    </html>
                `);
            }
        });

        // Check auth status endpoint
        app.get('/oauth/kick/status/:authId', (req, res) => {
            const { authId } = req.params;
            const status = this.getAuthStatus(authId);
            res.json(status);
        });
    }
}

module.exports = KickOAuthHandler;
