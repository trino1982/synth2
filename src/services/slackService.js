import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { WebClient } from '@slack/web-api';

const PORT = process.env.PROXY_PORT || 3001;
const PROXY_BASE_URL = `https://localhost:${PORT}`;

/**
 * Get Slack authorization URL
 * @param {string} userId - User ID to include as state parameter
 * @returns {string} Slack OAuth URL
 */
export function getSlackAuthUrl(userId) {
  const clientId = process.env.REACT_APP_SLACK_CLIENT_ID;
  const redirectUri = process.env.REACT_APP_SLACK_REDIRECT_URI;
  // These scopes allow access to messages in public channels, private channels, DMs, and group DMs
  const scopes = 'channels:history,channels:read,groups:history,groups:read,im:history,im:read,mpim:history,mpim:read,users:read';
  
  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`;
}

/**
 * Exchange authorization code for access token directly with Slack API
 * @param {string} code - Authorization code from Slack OAuth
 * @returns {Promise<Object>} Slack OAuth response
 */
export async function exchangeCodeForToken(code) {
  try {
    const clientId = process.env.REACT_APP_SLACK_CLIENT_ID;
    const clientSecret = process.env.REACT_APP_SLACK_CLIENT_SECRET;
    const redirectUri = process.env.REACT_APP_SLACK_REDIRECT_URI;
    
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }
    });
    
    if (!response.data.ok) {
      throw new Error(`Slack API error: ${response.data.error}`);
    }
    
    console.log('Token exchange successful');
    return response.data;
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
}

/**
 * Update user's Slack connection status in Firestore
 * @param {string} userId - Firebase user ID
 * @param {Object} slackData - Slack connection data (token, teamId, etc.)
 * @returns {Promise<void>}
 */
export async function updateSlackConnection(userId, slackData) {
  try {
    console.log(`[SlackService] Updating Slack connection for user: ${userId}`);
    
    // Ensure we have the minimum required data
    if (!slackData.access_token) {
      throw new Error('Missing access_token in slackData');
    }
    
    if (!slackData.team?.id) {
      throw new Error('Missing team.id in slackData');
    }
    
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    // Create or update user document
    const userData = {
      'connections.slack': {
        connected: true,
        teamId: slackData.team.id,
        teamName: slackData.team.name || 'Unknown',
        connectedAt: new Date().toISOString(),
        userId: userId,
        slackUserId: slackData.authed_user?.id || 'unknown',
        accessToken: slackData.access_token,
        scope: slackData.scope || '',
        lastSyncAt: new Date().toISOString()
      }
    };
    
    if (!userDoc.exists()) {
      // Create new user document if it doesn't exist
      await setDoc(userRef, {
        uid: userId,
        createdAt: new Date().toISOString(),
        ...userData
      });
    } else {
      // Update existing user document
      await updateDoc(userRef, userData);
    }
    
    console.log(`[SlackService] Updated Slack connection in Firebase for team: ${slackData.team.name || 'Unknown'}, user: ${userId}`);
    
    // If we have Electron, update the tokens there too for local access
    if (window.electron) {
      try {
        await window.electron.setSlackTokens({
          accessToken: slackData.access_token,
          teamId: slackData.team.id,
          userId: userId
        });
        console.log('[SlackService] Also updated Electron store with tokens');
      } catch (err) {
        console.error('[SlackService] Error updating Electron store:', err);
      }
    }
    
    return true;
  } catch (error) {
    console.error('[SlackService] Error updating Slack connection:', error);
    throw error;
  }
}

/**
 * Disconnect Slack from user account
 * @param {string} userId - Firebase user ID
 * @returns {Promise<void>}
 */
export async function disconnectSlack(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'connections.slack': {
        connected: false,
        disconnectedAt: new Date().toISOString()
      }
    });
    
    // Also clear from Electron store
    if (window.electron) {
      await window.electron.clearSlackTokens();
    }
    
    console.log(`[SlackService] Disconnected Slack for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('Error disconnecting Slack:', error);
    throw error;
  }
}

/**
 * Get user's Slack connection status
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} Connection status
 */
export async function getSlackConnectionStatus(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.connections?.slack || { connected: false };
    }
    
    return { connected: false };
  } catch (error) {
    console.error('Error getting Slack connection status:', error);
    return { connected: false, error: error.message };
  }
}

/**
 * Fetch recent messages from Slack
 * @param {number} [count=100] - Number of messages to fetch
 * @returns {Promise<Array>} Recent messages
 */
export async function fetchRecentMessages(count = 100) {
  try {
    // Get token from Electron or Firebase
    let token = null;
    
    if (window.electron) {
      const tokens = await window.electron.getSlackTokens();
      token = tokens?.accessToken;
    }
    
    if (!token) {
      throw new Error('No Slack token available');
    }
    
    // Initialize Slack client
    const slack = new WebClient(token);
    
    // Get available channels
    const { channels } = await slack.conversations.list({
      types: 'public_channel,private_channel,im,mpim',
      limit: 50
    });
    
    // Fetch messages from each channel
    const allMessages = [];
    
    for (const channel of channels) {
      try {
        const result = await slack.conversations.history({
          channel: channel.id,
          limit: Math.min(count, 50) // Slack API limits per request
        });
        
        // Add channel info to each message
        const messagesWithContext = result.messages.map(msg => ({
          ...msg,
          channel: {
            id: channel.id,
            name: channel.name || 'DM',
            type: channel.is_im ? 'dm' : channel.is_mpim ? 'group' : channel.is_private ? 'private' : 'public'
          },
          timestamp: new Date(parseInt(msg.ts) * 1000).toISOString()
        }));
        
        allMessages.push(...messagesWithContext);
      } catch (err) {
        console.error(`Error fetching messages from channel ${channel.id}:`, err);
        // Continue with other channels
      }
    }
    
    // Sort messages by timestamp (newest first)
    return allMessages
      .sort((a, b) => b.ts - a.ts)
      .slice(0, count);
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
}

/**
 * Fetch Slack channels
 * @returns {Promise<Array>} Slack channels
 */
export async function fetchSlackChannels() {
  try {
    // Get token from Electron or Firebase
    let token = null;
    
    if (window.electron) {
      const tokens = await window.electron.getSlackTokens();
      token = tokens?.accessToken;
    }
    
    if (!token) {
      throw new Error('No Slack token available');
    }
    
    // Initialize Slack client
    const slack = new WebClient(token);
    
    // Get available channels
    const { channels } = await slack.conversations.list({
      types: 'public_channel,private_channel,im,mpim',
      limit: 100
    });
    
    return channels.map(channel => ({
      id: channel.id,
      name: channel.name || 'DM',
      type: channel.is_im ? 'dm' : channel.is_mpim ? 'group' : channel.is_private ? 'private' : 'public',
      members: channel.num_members || 2
    }));
  } catch (error) {
    console.error('Error fetching channels:', error);
    throw error;
  }
}
