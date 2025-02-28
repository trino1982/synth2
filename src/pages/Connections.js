import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSlackAuthUrl, getSlackConnectionStatus, disconnectSlack } from '../services/slackService';
import Header from '../components/Header';

function Connections() {
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [slackConnection, setSlackConnection] = useState({ connected: false });
  const [disconnecting, setDisconnecting] = useState(false);
  
  useEffect(() => {
    async function fetchConnectionStatus() {
      if (currentUser) {
        try {
          setLoading(true);
          // Fetch status from Firebase
          const status = await getSlackConnectionStatus(currentUser.uid);
          setSlackConnection(status);
        } catch (error) {
          console.error('Error fetching connection status:', error);
        } finally {
          setLoading(false);
        }
      }
    }
    
    fetchConnectionStatus();
  }, [currentUser, userProfile]);
  
  const handleConnectSlack = () => {
    window.open(getSlackAuthUrl(), '_blank');
  };
  
  const handleDisconnectSlack = async () => {
    try {
      setDisconnecting(true);
      await disconnectSlack(currentUser.uid);
      await fetchUserProfile(currentUser.uid);
      setSlackConnection({ connected: false });
    } catch (error) {
      console.error('Error disconnecting Slack:', error);
    } finally {
      setDisconnecting(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl md:text-4xl text-indigo-900 dark:text-indigo-300 mb-8">Connections</h1>
        
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
