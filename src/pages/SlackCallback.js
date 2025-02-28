import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { exchangeCodeForToken, updateSlackConnection } from '../services/slackService';
import axios from 'axios'; // Import axios
import { WebClient } from '@slack/web-api'; // Import Slack SDK

function SlackCallback() {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  // Function to handle the OAuth code
  const processOAuthCode = async (code, stateUserId) => {
    try {
      if (!code) {
        setStatus('error');
        setError('No authorization code received from Slack');
        return;
      }
      
      // Get the user ID either from the state parameter or current user
      const userId = stateUserId || (currentUser ? currentUser.uid : null);
      
      if (!userId) {
        setStatus('error');
        setError('User ID not found. You must be logged in to connect Slack');
        return;
      }
      
      console.log('Processing OAuth code:', code, 'for user:', userId);
      
      // Exchange code for token
      let tokenData;
      try {
        tokenData = await exchangeCodeForToken(code, userId);
        console.log('Token exchange successful:', {
          hasAccessToken: !!tokenData.access_token,
          hasTeamId: !!tokenData.team?.id,
          scope: tokenData.scope,
          tokenType: tokenData.token_type
        });
      } catch (tokenErr) {
        console.error('Error exchanging code for token:', tokenErr);
        setStatus('error');
        setError(`Failed to exchange code for token: ${tokenErr.message || 'Unknown error'}`);
        return;
      }
      
      // Verify token data is complete
      if (!tokenData.access_token) {
        console.error('Missing access_token in response data', tokenData);
        setStatus('error');
        setError('Missing access token in response from Slack');
        return;
      }
      
      if (!tokenData.team?.id) {
        console.error('Missing team.id in response data', tokenData);
        setStatus('error');
        setError('Missing team ID in response from Slack');
        return;
      }
      
      // Verify the token works by calling the auth.test API using Slack SDK
      try {
        const slackClient = new WebClient(tokenData.access_token);
        const verifyResponse = await slackClient.auth.test();
        
        if (!verifyResponse.ok) {
          console.error('Token verification failed using SDK:', verifyResponse.error);
          setStatus('error');
          setError(`Token verification failed: ${verifyResponse.error || 'Unknown error'}`);
          return;
        }
        
        console.log('Token verification successful using SDK:', verifyResponse);
        
        // Add user info to token data
        tokenData.user_id = verifyResponse.user_id;
        tokenData.user = verifyResponse.user;
      } catch (verifyErr) {
        console.error('Error verifying token with Slack SDK:', verifyErr);
        // Fallback to axios method
        try {
          const axiosResponse = await axios.get('https://slack.com/api/auth.test', {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`
            }
          });
          
          if (!axiosResponse.data.ok) {
            console.error('Token verification failed with axios:', axiosResponse.data);
            setStatus('error');
            setError(`Token verification failed: ${axiosResponse.data.error || 'Unknown error'}`);
            return;
          }
          
          console.log('Token verification successful with axios:', axiosResponse.data);
          
          // Add user info to token data
          tokenData.user_id = axiosResponse.data.user_id;
          tokenData.user = axiosResponse.data.user;
        } catch (axiosErr) {
          console.error('Error verifying token with axios:', axiosErr);
          // Continue anyway to try storing the token
        }
      }
      
      // Store the token securely in Electron
      if (window.electron) {
        console.log('Storing Slack tokens in Electron', {
          accessToken: tokenData.access_token ? 'present' : 'missing',
          teamId: tokenData.team?.id || 'missing',
          userId: userId || 'missing'
        });
        
        try {
          // Store the tokens in Electron
          await window.electron.setSlackTokens({
            accessToken: tokenData.access_token,
            teamId: tokenData.team.id,
            userId: userId
          });
          
          // Verify the tokens were stored
          const storedTokens = await window.electron.getSlackTokens();
          console.log('Stored Slack tokens verification:', {
            accessToken: storedTokens.accessToken ? 'present' : 'missing',
            teamId: storedTokens.teamId || 'missing',
            userId: storedTokens.userId || 'missing'
          });
        } catch (err) {
          console.error('Error storing Slack tokens in Electron:', err);
          // Continue anyway to try Firebase storage
        }
      }
      
      // Update user's profile in Firebase
      try {
        await updateSlackConnection(userId, tokenData);
        console.log('Successfully updated Slack connection in Firebase');
      } catch (firebaseErr) {
        console.error('Error updating Slack connection in Firebase:', firebaseErr);
        setStatus('error');
        setError(`Failed to update connection data: ${firebaseErr.message || 'Unknown error'}`);
        return;
      }
      
      // Dispatch event to notify other components
      const connectionEvent = new CustomEvent('slack-connection-updated', {
        detail: { userId, connected: true }
      });
      window.dispatchEvent(connectionEvent);
      
      setStatus('success');
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate('/connections');
      }, 2000);
    } catch (err) {
      console.error('Error during Slack OAuth callback:', err);
      setStatus('error');
      setError(err.message || 'Failed to connect with Slack');
    }
  };
  
  useEffect(() => {
    // Handle OAuth callback from browser
    async function handleBrowserCallback() {
      try {
        // Get the code and state from URL
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const error = params.get('error');
        const stateUserId = params.get('state'); // Get the user ID from state
        
        if (error) {
          setStatus('error');
          setError(`Slack returned an error: ${error}`);
          return;
        }
        
        if (code) {
          console.log('Processing browser OAuth code:', code, 'with state:', stateUserId);
          await processOAuthCode(code, stateUserId);
          
          // Update the connection status in parent components
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('slack-connection-updated', {
              detail: { userId: stateUserId || (currentUser ? currentUser.uid : null) }
            }));
          }
        }
      } catch (err) {
        console.error('Error during browser OAuth callback:', err);
        setStatus('error');
        setError(err.message || 'Failed to connect with Slack');
      }
    }
    
    // Only call this in browser environment
    if (!window.electron) {
      handleBrowserCallback();
    }
    
    // Register for Electron app protocol handler events
    if (window.electron) {
      console.log('Setting up Slack OAuth callback listener in Electron');
      
      window.electron.onSlackOAuthCallback(async (data) => {
        console.log('Received Slack OAuth callback in Electron:', data);
        if (data && data.code) {
          await processOAuthCode(data.code, data.state);
          
          // Trigger a refresh event
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('slack-connection-updated', {
              detail: { userId: data.state || (currentUser ? currentUser.uid : null) }
            }));
          }
        }
      });
      
      // Clean up on unmount
      return () => {
        if (window.electron) {
          window.electron.removeSlackOAuthListener();
        }
      };
    }
  }, [location, currentUser, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg text-center">
        {status === 'processing' && (
          <>
            <div className="mb-6 flex justify-center">
              <svg className="animate-spin h-12 w-12 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-serif text-gray-900 dark:text-white mb-2">Connecting to Slack</h2>
            <p className="text-gray-600 dark:text-gray-400">Please wait while we connect your Slack account...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-serif text-gray-900 dark:text-white mb-2">Connected!</h2>
            <p className="text-gray-600 dark:text-gray-400">Your Slack account has been successfully connected.</p>
            <p className="text-gray-500 dark:text-gray-500 text-sm mt-4">Redirecting you back...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-red-100 p-3">
                <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-serif text-gray-900 dark:text-white mb-2">Connection Failed</h2>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={() => navigate('/connections')}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Connections
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SlackCallback;
