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
          <a href="${redirectUrl}" class="button">Back to Synth</a>
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
  
  // For successful authorization, just redirect to the app
  // The client-side code will handle the OAuth token exchange
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Synth - Connecting to Slack</title>
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
          background-color: #E0E7FF;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }
        .redirect-message {
          color: #6B7280;
          margin-top: 24px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1>Connecting to Slack</h1>
        <p>Redirecting you back to Synth to complete the connection process...</p>
        <p class="redirect-message">If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
      </div>
      <script>
        // Redirect to the app using the custom protocol
        setTimeout(() => {
          window.location.href = "${redirectUrl}";
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// Slack OAuth endpoint
app.post('/api/slack/oauth', async (req, res) => {
  try {
    const { code } = req.body;
    
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
