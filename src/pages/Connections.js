import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSlackAuthUrl, getSlackConnectionStatus, disconnectSlack } from '../services/slackService';
import Header from '../components/Header';

function Connections() {
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slackConnection, setSlackConnection] = useState({ connected: false });
  const [disconnecting, setDisconnecting] = useState(false);
  
  const fetchConnectionStatus = async () => {
    if (currentUser) {
      try {
        setLoading(true);
        console.log('Fetching connection status for user:', currentUser.uid);
        
        // Fetch status from Firebase
        const status = await getSlackConnectionStatus(currentUser.uid);
        console.log('Slack connection status:', status);
        setSlackConnection(status);
        
        // Also check for tokens in electron store if available
        if (window.electron) {
          try {
            const tokens = await window.electron.getSlackTokens();
            console.log('Electron Slack tokens:', {
              hasAccessToken: !!tokens.accessToken,
              hasTeamId: !!tokens.teamId,
              userId: tokens.userId
            });
            
            if (tokens && tokens.accessToken && !status.connected) {
              console.log('Found tokens in Electron store but not in Firebase, refreshing profile...');
              await fetchUserProfile(currentUser.uid);
              const updatedStatus = await getSlackConnectionStatus(currentUser.uid);
              console.log('Updated status after refresh:', updatedStatus);
              setSlackConnection(updatedStatus);
            }
          } catch (err) {
            console.error('Error checking Electron tokens:', err);
          }
        }
      } catch (error) {
        console.error('Error fetching connection status:', error);
      } finally {
        setLoading(false);
      }
    }
  };
  
  useEffect(() => {
    fetchConnectionStatus();
    
    // Listen for connection updates from SlackCallback component
    const handleConnectionUpdate = (event) => {
      console.log('Received slack-connection-updated event', event.detail);
      
      // If a specific user ID was provided in the event, use it
      if (event.detail && event.detail.userId) {
        console.log(`Fetching connection status for specific user ID: ${event.detail.userId}`);
        fetchUserProfile(event.detail.userId).then(() => {
          fetchConnectionStatus();
        });
      } else {
        fetchConnectionStatus();
      }
    };
    
    window.addEventListener('slack-connection-updated', handleConnectionUpdate);
    
    // Listen for Slack OAuth callback in Electron
    if (window.electron) {
      window.electron.onSlackOAuthCallback(async (data) => {
        console.log('Received Slack OAuth callback in Connections component:', data);
        if (data && data.code) {
          // Wait a bit and then refresh
          setTimeout(() => {
            fetchConnectionStatus();
          }, 2000);
        }
      });
      
      // Clean up
      return () => {
        window.removeEventListener('slack-connection-updated', handleConnectionUpdate);
        if (window.electron) {
          window.electron.removeSlackOAuthListener();
        }
      };
    }
    
    return () => {
      window.removeEventListener('slack-connection-updated', handleConnectionUpdate);
    };
  }, [currentUser, userProfile]);
  
  const handleConnectSlack = () => {
    if (!currentUser) {
      console.error("Cannot connect to Slack: User not logged in");
      return;
    }
    
    console.log("Opening Slack authorization page with user ID:", currentUser.uid);
    window.open(getSlackAuthUrl(currentUser.uid), '_blank');
  };
  
  const handleDisconnectSlack = async () => {
    try {
      setDisconnecting(true);
      await disconnectSlack(currentUser.uid);
      if (window.electron) {
        await window.electron.clearSlackTokens();
      }
      await fetchUserProfile(currentUser.uid);
      setSlackConnection({ connected: false });
    } catch (error) {
      console.error('Error disconnecting Slack:', error);
    } finally {
      setDisconnecting(false);
    }
  };
  
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchUserProfile(currentUser.uid);
      await fetchConnectionStatus();
    } catch (error) {
      console.error('Error refreshing connections:', error);
    } finally {
      setRefreshing(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl text-indigo-900 dark:text-indigo-300">Connections</h1>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 dark:text-indigo-200 dark:bg-indigo-900/30 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-800/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                  <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-300" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                  </svg>
                </div>
                <div className="ml-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Slack</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {slackConnection.connected
                      ? `Connected to ${slackConnection.teamName || 'your workspace'}`
                      : 'Not connected'}
                  </p>
                </div>
              </div>
              <div>
                {loading ? (
                  <div className="animate-pulse h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                ) : slackConnection.connected ? (
                  <button
                    onClick={handleDisconnectSlack}
                    disabled={disconnecting}
                    className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={handleConnectSlack}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Future integrations could be added here */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 opacity-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                  <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12 12-5.373 12-12S18.628 0 12 0zm6 13h-5v5h-2v-5H6v-2h5V6h2v5h5v2z"/>
                  </svg>
                </div>
                <div className="ml-4">
                  <h2 className="text-lg font-medium text-gray-600 dark:text-gray-400">Add more connections</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    More integrations coming soon
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Connections;
