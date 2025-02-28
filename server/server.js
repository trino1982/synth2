require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Debug logging
const DEBUG = process.env.DEBUG === 'true';

// Helper function to log in debug mode
function debugLog(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}

// Store tokens temporarily - In production, use a secure storage
const slackTokens = {};

// Serve a static page for the Slack OAuth callback success
app.get('/slack/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;
  const userId = req.query.state; // Get the user ID from the state parameter
  
  // Prepare the protocol redirect URL with the user ID included
  const redirectParams = new URLSearchParams(req.query);
  const redirectUrl = `synth://slack/oauth/callback?${redirectParams.toString()}`;
  
  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Synth - Connection Failed</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Caslon+Display&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(to bottom right, #f5f7ff, #eef2ff);
            color: #374151;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            max-width: 500px;
            text-align: center;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
            padding: 40px;
          }
          h1 {
            font-family: 'Libre Caslon Display', serif;
            margin-bottom: 16px;
            color: #1F2937;
          }
          .icon {
            background-color: #FEE2E2;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          }
          .error-message {
            color: #B91C1C;
            margin-bottom: 24px;
          }
          .button {
            background: #4F46E5;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            text-decoration: none;
            display: inline-block;
          }
          .button:hover {
            background: #4338CA;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 18L18 6M6 6L18 18" stroke="#B91C1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Connection Failed</h1>
          <p class="error-message">Slack returned an error: ${error}</p>
          <a href="${redirectUrl}" class="button">Back to Connections</a>
        </div>
        <script>
          // Try to redirect to the app using the custom protocol
          setTimeout(() => {
            window.location.href = "${redirectUrl}";
          }, 1500);
        </script>
      </body>
      </html>
    `);
  }
  
  // If successful, exchange code for token and serve the success page with auto-redirect
  if (code) {
    let tokenData = null;
    let verificationResult = null;
    let debugInfo = {
      codeReceived: true,
      tokenExchanged: false,
      tokenVerified: false,
      error: null,
      userId: userId // Include the user ID in debug info
    };
    
    try {
      // Exchange the code for a token
      const clientId = process.env.REACT_APP_SLACK_CLIENT_ID;
      const clientSecret = process.env.REACT_APP_SLACK_CLIENT_SECRET;
      const redirectUri = process.env.REACT_APP_SLACK_REDIRECT_URI;
      
      // Make request to Slack API to exchange code for token
      const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri
        }
      });
      
      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }
      
      // Store token in temporary storage with user ID
      tokenData = response.data;
      tokenData.firebase_user_id = userId; // Associate the Firebase user ID with the token data
      debugInfo.tokenExchanged = true;
      debugLog('Token exchange successful for team:', tokenData.team.name, 'user ID:', userId);
      
      // Verify the token works by calling a simple API method
      try {
        const verifyResponse = await axios.get('https://slack.com/api/auth.test', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`
          }
        });
        
        if (verifyResponse.data.ok) {
          debugInfo.tokenVerified = true;
          verificationResult = verifyResponse.data;
          debugLog('Token verification successful:', verificationResult.team);
        } else {
          debugInfo.error = `Token verification failed: ${verifyResponse.data.error}`;
          debugLog('Token verification failed:', verifyResponse.data.error);
        }
      } catch (verifyErr) {
        debugInfo.error = `Token verification error: ${verifyErr.message}`;
        debugLog('Token verification error:', verifyErr);
      }
      
      // Save token to temporary storage with user ID as part of the key
      const tokenKey = userId ? `${code}:${userId}` : code;
      slackTokens[tokenKey] = tokenData;
    } catch (err) {
      console.error('Error exchanging code for token:', err);
      debugInfo.error = `Token exchange error: ${err.message}`;
      // Continue with the redirect anyway, the client will handle the error
    }
    
    const debugInfoStr = JSON.stringify(debugInfo, null, 2);
    
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Synth - Connection Successful</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Caslon+Display&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(to bottom right, #f0f9ff, #e0f2fe);
            color: #374151;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            max-width: 500px;
            text-align: center;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
            padding: 40px;
          }
          h1 {
            font-family: 'Libre Caslon Display', serif;
            margin-bottom: 16px;
            color: #1F2937;
          }
          .icon {
            background-color: ${debugInfo.tokenVerified ? '#DCFCE7' : '#FEF9C3'};
            width: 64px;
            height: 64px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          }
          .success-message {
            color: #065F46;
            margin-bottom: 24px;
          }
          .warning-message {
            color: #92400E;
            margin-bottom: 24px;
          }
          .redirect-message {
            color: #6B7280;
            font-size: 14px;
            margin-top: 32px;
          }
          .button {
            background: #4F46E5;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-block;
            margin-top: 16px;
            font-size: 16px;
          }
          .button:hover {
            background: #4338CA;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
          }
          .debug-info {
            background: #F3F4F6;
            border-radius: 6px;
            padding: 16px;
            margin-top: 24px;
            text-align: left;
            font-family: monospace;
            font-size: 12px;
            overflow-x: auto;
            max-height: 200px;
            overflow-y: auto;
          }
          .toggle-debug {
            background: none;
            border: none;
            color: #6B7280;
            font-size: 12px;
            cursor: pointer;
            margin-top: 16px;
          }
          .toggle-debug:hover {
            color: #4B5563;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">
            ${debugInfo.tokenVerified 
              ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 13l4 4L19 7" stroke="#047857" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`
              : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="#92400E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`
            }
          </div>
          <h1>Connection ${debugInfo.tokenVerified ? 'Successful!' : 'Initiated'}</h1>
          ${debugInfo.tokenVerified 
            ? `<p class="success-message">Your Slack workspace has been successfully connected to Synth.</p>` 
            : `<p class="warning-message">Connection initiated, but verification is pending. Please check the app.</p>`
          }
          <p>You can now access and analyze your Slack data in Synth.</p>
          <p class="redirect-message">You will be automatically redirected to the app...</p>
          
          <a href="${redirectUrl}" class="button">Return to Synth</a>
          
          <button class="toggle-debug" onclick="toggleDebug()">Show Debug Info</button>
          
          <pre id="debug-info" class="debug-info" style="display: none;">${debugInfoStr}</pre>
          
          <script>
            // Function to toggle debug info visibility
            function toggleDebug() {
              const debugInfo = document.getElementById('debug-info');
              const button = document.querySelector('.toggle-debug');
              
              if (debugInfo.style.display === 'none') {
                debugInfo.style.display = 'block';
                button.textContent = 'Hide Debug Info';
              } else {
                debugInfo.style.display = 'none';
                button.textContent = 'Show Debug Info';
              }
            }
            
            // Log details to console for debugging
            console.log('Slack OAuth callback debug info:', ${JSON.stringify(debugInfo)});
            ${tokenData ? `console.log('Token data (partial):', { team: '${tokenData.team?.name || "unknown"}', tokenType: '${tokenData.token_type || "unknown"}' });` : ''}
            ${verificationResult ? `console.log('Verification result:', ${JSON.stringify(verificationResult)});` : ''}
            
            // Attempt redirection with a fallback timer
            function attemptRedirect() {
              const redirectUrl = "${redirectUrl}";
              console.log("Attempting to redirect to:", redirectUrl);
              
              // Create an iframe for the redirect attempt (more reliable than location.href)
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = redirectUrl;
              document.body.appendChild(iframe);
              
              // Also try with window.location as a backup
              setTimeout(() => {
                window.location.href = redirectUrl;
              }, 500);
            }
            
            // Wait a moment before trying the redirect
            setTimeout(attemptRedirect, 1500);
          </script>
        </div>
      </body>
      </html>
    `);
  }
  
  // Fallback redirect to the app with the code
  res.redirect(redirectUrl);
});

// Endpoint to retrieve already exchanged tokens
app.get('/api/slack/token/:code', (req, res) => {
  const { code } = req.params;
  const { userId } = req.query;
  
  // Add userId to the key if provided for more specific lookups
  const tokenKey = userId ? `${code}:${userId}` : code;
  const tokenData = slackTokens[tokenKey];
  
  if (tokenData) {
    console.log(`Retrieved stored token for code: ${code}, user ID: ${userId || 'unspecified'}`);
    return res.json(tokenData);
  }
  
  // If we don't have the token data for this specific key, try to find it with just the code
  // This is a fallback for when userId might not be consistently used between requests
  if (userId && !tokenData) {
    const fallbackData = slackTokens[code];
    if (fallbackData) {
      console.log(`Retrieved token with fallback key for code: ${code}`);
      return res.json(fallbackData);
    }
  }
  
  // If still no token found, try a more exhaustive search 
  const allKeys = Object.keys(slackTokens);
  const matchingKeys = allKeys.filter(key => key.startsWith(`${code}:`) || key === code);
  
  if (matchingKeys.length > 0) {
    // Use the first matching key (most recent)
    const firstMatchingKey = matchingKeys[0];
    console.log(`Found token using partial key match: ${firstMatchingKey}`);
    return res.json(slackTokens[firstMatchingKey]);
  }
  
  // No token data found
  console.log(`No token found for code: ${code}, user ID: ${userId || 'unspecified'}`);
  return res.status(404).json({ 
    error: 'Token not found', 
    code: code,
    userId: userId || null
  });
});

// Slack OAuth endpoint
app.post('/api/slack/oauth', async (req, res) => {
  try {
    const { code } = req.body;
    
    // Check if we already have the token
    if (slackTokens[code]) {
      debugLog('Token already exchanged, returning from cache');
      const tokenData = slackTokens[code];
      // Remove from cache after returning
      delete slackTokens[code];
      return res.json(tokenData);
    }
    
    // Exchange the code for a token
    const clientId = process.env.REACT_APP_SLACK_CLIENT_ID;
    const clientSecret = process.env.REACT_APP_SLACK_CLIENT_SECRET;
    const redirectUri = process.env.REACT_APP_SLACK_REDIRECT_URI;
    
    debugLog('Exchanging code for token:', code);
    
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      },
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded' 
      }
    });
    
    const data = response.data;
    debugLog('OAuth response:', data);
    
    if (!data.ok) {
      return res.status(400).json({ error: data.error || 'Failed to exchange code for token' });
    }
    
    // Store the token temporarily (for demo purposes)
    if (data.authed_user && data.authed_user.id) {
      slackTokens[data.authed_user.id] = data.access_token;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Slack OAuth error:', error);
    res.status(500).json({ error: 'Failed to authenticate with Slack' });
  }
});

// Middleware to get Slack client with valid token
const getSlackClient = (req, res, next) => {
  const token = req.headers['x-slack-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Slack token is required' });
  }
  
  req.slackClient = new WebClient(token);
  next();
};

// Get recent messages from all channels
app.get('/api/slack/messages', getSlackClient, async (req, res) => {
  try {
    const client = req.slackClient;
    
    // Get list of conversations
    const conversationsResponse = await client.conversations.list({
      types: 'public_channel,private_channel,im,mpim',
      limit: 10
    });
    
    const channels = conversationsResponse.channels;
    let allMessages = [];
    
    // Get messages from each channel
    for (const channel of channels) {
      try {
        const historyResponse = await client.conversations.history({
          channel: channel.id,
          limit: 10
        });
        
        if (historyResponse.messages && historyResponse.messages.length > 0) {
          // Add channel information to each message
          const messagesWithChannel = historyResponse.messages.map(msg => ({
            ...msg,
            channel: {
              id: channel.id,
              name: channel.name || 'Direct Message'
            }
          }));
          
          allMessages = [...allMessages, ...messagesWithChannel];
        }
      } catch (channelError) {
        debugLog(`Error fetching messages for channel ${channel.id}:`, channelError);
      }
    }
    
    // Sort messages by timestamp (newest first)
    allMessages.sort((a, b) => Number(b.ts) - Number(a.ts));
    
    // Limit to 50 most recent messages
    allMessages = allMessages.slice(0, 50);
    
    res.json(allMessages);
  } catch (error) {
    console.error('Error fetching Slack messages:', error);
    res.status(500).json({ error: 'Failed to fetch Slack messages' });
  }
});

// Get channels
app.get('/api/slack/channels', getSlackClient, async (req, res) => {
  try {
    const client = req.slackClient;
    
    const response = await client.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true
    });
    
    res.json(response.channels);
  } catch (error) {
    console.error('Error fetching Slack channels:', error);
    res.status(500).json({ error: 'Failed to fetch Slack channels' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check if we're in development mode
const isDevMode = process.env.NODE_ENV !== 'production';

// For development, create self-signed certificates
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'server.cert')),
};

// Create HTTPS server
try {
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`HTTPS server running on port ${PORT}`);
  });
} catch (error) {
  console.error('Failed to start HTTPS server:', error);
  console.log('Falling back to HTTP...');
  
  // Fallback to HTTP if HTTPS fails
  app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
  });
}
