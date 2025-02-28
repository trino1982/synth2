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
        // Get the code from URL
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const error = params.get('error');
        
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
        
        if (!currentUser) {
          setStatus('error');
          setError('You must be logged in to connect Slack');
          return;
        }
        
        // Exchange code for token
        const tokenData = await exchangeCodeForToken(code);
        
        // Store the token securely
        if (window.electron) {
          await window.electron.setSlackTokens({
            accessToken: tokenData.access_token,
            teamId: tokenData.team.id
          });
        }
        
        // Update user's profile in Firebase
        await updateSlackConnection(currentUser.uid, tokenData);
        
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
    }
    
    handleOAuthCallback();
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
