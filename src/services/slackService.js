import axios from 'axios';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const PROXY_BASE_URL = `http://localhost:${process.env.PROXY_PORT || 3001}`;

/**
 * Get Slack authorization URL
 * @returns {string} Slack OAuth URL
 */
export function getSlackAuthUrl() {
  const clientId = process.env.REACT_APP_SLACK_CLIENT_ID;
  const redirectUri = process.env.REACT_APP_SLACK_REDIRECT_URI;
  const scopes = 'channels:history,channels:read,chat:write,groups:history,groups:read,im:history,im:read,mpim:history,mpim:read,users:read';
  
  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Exchange authorization code for access token
 * @param {string} code - Authorization code from Slack OAuth
 * @returns {Promise<Object>} Slack OAuth response
 */
export async function exchangeCodeForToken(code) {
  try {
    const response = await axios.post(`${PROXY_BASE_URL}/api/slack/oauth`, { code });
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
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'connections.slack': {
        connected: true,
        teamId: slackData.team.id,
        teamName: slackData.team.name,
        connectedAt: new Date().toISOString(),
        ...slackData
      }
    });
  } catch (error) {
    console.error('Error updating Slack connection:', error);
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
