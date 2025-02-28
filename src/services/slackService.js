import axios from 'axios';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { WebClient } from '@slack/web-api'; // Import Slack SDK

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
    
    // Ensure we have the minimum required data
    if (!slackData.access_token) {
      console.error('[SlackService] Missing access_token in slackData:', slackData);
      throw new Error('Missing access_token in slackData');
    }
    
    if (!slackData.team?.id) {
      console.error('[SlackService] Missing team.id in slackData:', slackData);
      throw new Error('Missing team.id in slackData');
    }
    
    // Double-check token with Slack API if not already verified
    if (!slackData.user_id) {
      try {
        const slackClient = new WebClient(slackData.access_token);
        const verifyResponse = await slackClient.auth.test();
        
        if (verifyResponse.ok) {
          console.log('[SlackService] Token verification successful:', verifyResponse);
          
          // Add user info to slackData
          slackData.user_id = verifyResponse.user_id;
          slackData.user = verifyResponse.user;
        } else {
          console.warn('[SlackService] Token verification warning:', verifyResponse.error);
        }
      } catch (verifyErr) {
        console.error('[SlackService] Token verification warning (non-fatal):', verifyErr);
        // Continue with the update
      }
    }
    
    const userRef = doc(db, 'users', userId);
    
    // First check if the user document exists
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log(`[SlackService] User document doesn't exist, creating it first`);
      // Create the user document first
      await updateDoc(userRef, {
        createdAt: new Date().toISOString(),
        uid: userId,
        connections: {}
      }).catch(error => {
        // If the document doesn't exist, updateDoc will fail
        console.log(`[SlackService] Error creating user document, will try set instead:`, error);
      });
    }
    
    // Now update with the Slack connection data
    await updateDoc(userRef, {
      'connections.slack': {
        connected: true,
        teamId: slackData.team.id,
        teamName: slackData.team.name || 'Synth',
        connectedAt: new Date().toISOString(),
        userId: userId,
        slackUserId: slackData.user_id || 'unknown',
        slackUsername: slackData.user || 'unknown',
        accessToken: slackData.access_token, // Explicitly store access token
        scope: slackData.scope || '',
        ...slackData
      }
    });
    
    console.log(`[SlackService] Updated Slack connection in Firebase for team: ${slackData.team.name || 'Synth'}, user: ${userId}`);
    
    // If we have Electron, update the tokens there too
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
        firebaseStatus.connected ? 'Connected' : 'Not connected',
        firebaseStatus.connected ? `Team: ${firebaseStatus.teamName || 'Unknown'}` : '');
    } else {
      console.log('[SlackService] User document does not exist in Firebase');
    }
    
    // Get status from Electron store if available
    if (window.electron) {
      try {
        const tokens = await window.electron.getSlackTokens();
        if (tokens && tokens.accessToken) {
          electronStatus.connected = true;
          electronStatus.token = tokens.accessToken;
          electronStatus.teamId = tokens.teamId;
          
          console.log(`[SlackService] Electron status: Connected to team ID ${tokens.teamId}`);
          
          // If we have token in Electron but not in Firebase, we should verify it's still valid
          if (!firebaseStatus.connected) {
            console.log('[SlackService] Found token in Electron but not in Firebase, verifying token validity...');
            try {
              // Try to validate the token with Slack SDK
              const slackClient = new WebClient(tokens.accessToken);
              const verifyResponse = await slackClient.auth.test();
              
              if (verifyResponse.ok) {
                console.log('[SlackService] Token verification successful using SDK:', verifyResponse);
                
                // Token is valid, update Firebase with this token data
                await updateSlackConnection(userId, {
                  access_token: tokens.accessToken,
                  team: {
                    id: tokens.teamId,
                    name: verifyResponse.team || 'Synth'
                  },
                  user_id: verifyResponse.user_id,
                  user: verifyResponse.user
                });
                
                // Update Firebase status to reflect the valid token
                firebaseStatus = {
                  connected: true,
                  teamId: tokens.teamId,
                  teamName: verifyResponse.team || 'Synth',
                  userId: userId,
                  slackUserId: verifyResponse.user_id,
                  slackUsername: verifyResponse.user
                };
              } else {
                console.error('[SlackService] Token verification failed:', verifyResponse.error);
                // Token is invalid, clear it from Electron
                await window.electron.clearSlackTokens();
                electronStatus.connected = false;
              }
            } catch (verifyErr) {
              console.error('[SlackService] Error verifying token with SDK:', verifyErr);
              
              // Try fallback to axios method
              try {
                const verifyResponse = await axios.get('https://slack.com/api/auth.test', {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`
                  }
                });
                
                if (verifyResponse.data.ok) {
                  console.log('[SlackService] Token verification successful with axios:', verifyResponse.data);
                  
                  // Token is valid, update Firebase with this token data
                  await updateSlackConnection(userId, {
                    access_token: tokens.accessToken,
                    team: {
                      id: tokens.teamId,
                      name: verifyResponse.data.team || 'Synth'
                    },
                    user_id: verifyResponse.data.user_id,
                    user: verifyResponse.data.user
                  });
                  
                  // Update Firebase status to reflect the valid token
                  firebaseStatus = {
                    connected: true,
                    teamId: tokens.teamId,
                    teamName: verifyResponse.data.team || 'Synth',
                    userId: userId,
                    slackUserId: verifyResponse.data.user_id,
                    slackUsername: verifyResponse.data.user
                  };
                } else {
                  console.error('[SlackService] Token verification failed with axios:', verifyResponse.data.error);
                  // Token is invalid, clear it from Electron
                  await window.electron.clearSlackTokens();
                  electronStatus.connected = false;
                }
              } catch (axiosErr) {
                console.error('[SlackService] Error verifying token with axios:', axiosErr);
                // On error, keep the electron status as is but log the error
              }
            }
          }
        } else {
          console.log('[SlackService] No valid tokens found in Electron store');
        }
      } catch (err) {
        console.error('[SlackService] Error checking Electron tokens:', err);
      }
    }
    
    // Return the merged status, preferring Firebase status if connected
    // or Electron status if Firebase is not connected
    return {
      connected: firebaseStatus.connected || electronStatus.connected,
      teamId: firebaseStatus.teamId || electronStatus.teamId,
      teamName: firebaseStatus.teamName || 'Synth',
      slackUserId: firebaseStatus.slackUserId || 'unknown',
      slackUsername: firebaseStatus.slackUsername || 'unknown',
      source: firebaseStatus.connected ? 'firebase' : electronStatus.connected ? 'electron' : 'none'
    };
  } catch (error) {
    console.error('[SlackService] Error getting connection status:', error);
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
