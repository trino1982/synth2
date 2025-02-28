import axios from 'axios';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
  const scopes = 'channels:history,channels:read,chat:write,groups:history,groups:read,im:history,im:read,mpim:history,mpim:read,users:read';
  
  // Include the user ID as the state parameter for the callback
  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`;
}

/**
 * Exchange authorization code for access token
 * @param {string} code - Authorization code from Slack OAuth
 * @param {string} userId - User ID to associate with token
 * @returns {Promise<Object>} Slack OAuth response
 */
export async function exchangeCodeForToken(code, userId) {
  console.log(`Exchanging code for token for user: ${userId || 'Unknown'}`);
  
  try {
    // First try to retrieve an already exchanged token
    let url = `/api/slack/token/${code}`;
    if (userId) {
      url += `?userId=${userId}`;
    }
    
    const response = await axios.get(`${PROXY_BASE_URL}${url}`);
    console.log('Retrieved token from server');
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('Token not found, will try direct exchange');
      throw new Error('Token not found on server, please try connecting again');
    }
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
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'connections.slack': {
        connected: true,
        teamId: slackData.team.id,
        teamName: slackData.team.name,
        connectedAt: new Date().toISOString(),
        userId: userId,
        ...slackData
      }
    });
    console.log(`[SlackService] Updated Slack connection in Firebase for team: ${slackData.team.name}, user: ${userId}`);
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
        connected: false
      }
    });
    
    // Also clear from Electron store
    if (window.electron) {
      await window.electron.clearSlackTokens();
    }
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
    console.log(`[SlackService] Getting connection status for user: ${userId}`);
    let firebaseStatus = { connected: false };
    let electronStatus = { connected: false };
    
    // Get status from Firebase
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      firebaseStatus = userData.connections?.slack || { connected: false };
      console.log(`[SlackService] Firebase status:`, 
        firebaseStatus.connected ? 'Connected' : 'Not connected');
    }
    
    // Get status from Electron store if available
    if (window.electron) {
      try {
        const tokens = await window.electron.getSlackTokens();
        console.log(`[SlackService] Electron tokens:`, {
          hasAccessToken: !!tokens.accessToken,
          hasTeamId: !!tokens.teamId,
          hasUserId: !!tokens.userId,
          storedUserId: tokens.userId
        });
        
        // Check if we have tokens in Electron store
        if (tokens && tokens.accessToken && tokens.teamId) {
          electronStatus = { 
            connected: true,
            teamId: tokens.teamId,
            accessToken: tokens.accessToken,
            userId: tokens.userId
          };
        }
      } catch (err) {
        console.error('[SlackService] Error getting Electron tokens:', err);
      }
    }
    
    // If Firebase shows connected but Electron doesn't, update Electron
    if (firebaseStatus.connected && !electronStatus.connected && window.electron && firebaseStatus.accessToken) {
      console.log('[SlackService] Syncing Firebase tokens to Electron store');
      await window.electron.setSlackTokens({
        accessToken: firebaseStatus.accessToken,
        teamId: firebaseStatus.teamId,
        userId: userId
      });
    }
    
    // If Electron shows connected but Firebase doesn't, update Firebase
    if (electronStatus.connected && !firebaseStatus.connected) {
      console.log('[SlackService] Syncing Electron tokens to Firebase');
      await updateSlackConnection(userId, { 
        access_token: electronStatus.accessToken,
        team: { id: electronStatus.teamId, name: 'Synth' }
      });
      // Refresh Firebase status
      const refreshedDoc = await getDoc(userRef);
      if (refreshedDoc.exists()) {
        const refreshedData = refreshedDoc.data();
        firebaseStatus = refreshedData.connections?.slack || { connected: false };
      }
    }
    
    // Return Firebase status (now updated if needed)
    return firebaseStatus;
  } catch (error) {
    console.error('[SlackService] Error getting Slack connection status:', error);
    return { connected: false, error: error.message };
  }
}

/**
 * Fetch recent messages from Slack
 * @param {string} token - Slack access token
 * @returns {Promise<Array>} Recent messages
 */
export async function fetchRecentMessages() {
  try {
    const response = await axios.get(`${PROXY_BASE_URL}/api/slack/messages`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Slack messages:', error);
    throw error;
  }
}

/**
 * Fetch Slack channels
 * @returns {Promise<Array>} Slack channels
 */
export async function fetchSlackChannels() {
  try {
    const response = await axios.get(`${PROXY_BASE_URL}/api/slack/channels`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Slack channels:', error);
    throw error;
  }
}
