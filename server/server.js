require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');
const axios = require('axios');

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

// Slack OAuth endpoint
app.post('/api/slack/oauth', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    debugLog('Exchanging code for token:', code);
    
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.REACT_APP_SLACK_CLIENT_ID,
        client_secret: process.env.REACT_APP_SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.REACT_APP_SLACK_REDIRECT_URI
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

// Start server
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
