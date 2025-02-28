import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { exchangeCodeForToken, updateSlackConnection } from '../services/slackService';

function SlackCallback() {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  useEffect(() => {
    async function handleOAuthCallback() {
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
        
        console.log('Processing OAuth code for user:', userId);
        
        // Step 1: Exchange code for token directly with Slack API
        let tokenData;
        try {
          tokenData = await exchangeCodeForToken(code);
          console.log('Token exchange successful');
        } catch (tokenErr) {
          console.error('Error exchanging code for token:', tokenErr);
          setStatus('error');
          setError(`Failed to exchange code for token: ${tokenErr.message || 'Unknown error'}`);
          return;
        }
        
        // Step 2: Store token and connection data in Firebase
        try {
          await updateSlackConnection(userId, tokenData);
          console.log('Successfully updated Slack connection');
          
          // Notify other components via custom event
          window.dispatchEvent(new CustomEvent('slack-connection-updated', {
            detail: { userId, connected: true }
          }));
          
          setStatus('success');
          
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            navigate('/dashboard');
          }, 1500);
        } catch (updateErr) {
          console.error('Error updating Slack connection:', updateErr);
          setStatus('error');
          setError(`Failed to save connection data: ${updateErr.message || 'Unknown error'}`);
        }
      } catch (err) {
        console.error('Error during Slack OAuth callback:', err);
        setStatus('error');
        setError(err.message || 'Failed to connect with Slack');
      }
    }
    
    handleOAuthCallback();
  }, [location.search, currentUser, navigate]);
  
  // Render different UI based on status
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
        {status === 'processing' && (
          <>
            <div className="flex justify-center mb-4">
              <svg className="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-center text-gray-800 mb-2">Connecting to Slack</h2>
            <p className="text-center text-gray-600">Please wait while we establish the connection...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4 text-green-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-center text-gray-800 mb-2">Successfully Connected!</h2>
            <p className="text-center text-gray-600 mb-6">Your Slack account has been connected to Synth2.</p>
            <p className="text-center text-gray-500 text-sm">Redirecting to dashboard...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="flex justify-center mb-4 text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-center text-gray-800 mb-2">Connection Error</h2>
            <p className="text-center text-red-600 mb-6">{error}</p>
            <div className="flex justify-center">
              <button 
                onClick={() => navigate('/connections')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Return to Connections
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SlackCallback;
