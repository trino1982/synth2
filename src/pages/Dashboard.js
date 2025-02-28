import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Link } from 'react-router-dom';
import { fetchRecentMessages } from '../services/slackService';
import { assessMessageUrgency, synthesizeData } from '../services/aiService';

// Components
import Header from '../components/Header';

function Dashboard() {
  const { currentUser, userProfile } = useAuth();
  const { darkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [urgencyData, setUrgencyData] = useState({
    urgent: false,
    urgentCount: 0,
    summary: 'No urgent messages'
  });
  const [actionItems, setActionItems] = useState([]);
  
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Check if Slack is connected
        const isSlackConnected = userProfile?.connections?.slack?.connected;
        
        if (isSlackConnected) {
          // Fetch messages from Slack
          const messages = await fetchRecentMessages();
          
          // Assess message urgency
          const urgency = await assessMessageUrgency(messages);
          setUrgencyData(urgency);
          
          // Generate action items from messages
          const synthesis = await synthesizeData({
            messages,
            user: {
              displayName: currentUser.displayName,
              email: currentUser.email
            }
          });
          
          // Parse the insights to create action items
          // This is simplified - in a real app, you might have more structure
          const insights = synthesis.insights;
          const items = insights.split('\n')
            .filter(line => line.trim().length > 0)
            .map((line, index) => ({
              id: `item-${index}`,
              content: line,
              source: 'slack'
            }));
          
          setActionItems(items.slice(0, 3)); // Take first 3 items
        } else {
          // Set default data when Slack is not connected
          setUrgencyData({
            urgent: false,
            urgentCount: 0,
            summary: 'Connect your Slack account to see urgent messages'
          });
          
          setActionItems([
            {
              id: 'connect-slack',
              content: 'Connect your Slack account to see action items',
              source: 'system'
            }
          ]);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load data. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [currentUser, userProfile]);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl md:text-5xl text-indigo-900 dark:text-indigo-300 mb-8">
          Everything is fine, {currentUser?.displayName?.split(' ')[0] || 'there'}
        </h1>
        
        {error && (
          <div className="p-4 mb-6 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900/30 dark:text-red-300" role="alert">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-cards gap-6">
          {/* Urgency Card */}
          <div className={`card ${urgencyData.urgent ? 'bg-gradient-to-br from-red-500 to-pink-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'} text-white`}>
            <h3 className="font-bold text-xl mb-3">
              {urgencyData.urgent ? 'Urgent messages' : 'No urgent messages'}
            </h3>
            <p className="text-white/90">
              {urgencyData.urgent 
                ? `${urgencyData.urgentCount} message${urgencyData.urgentCount !== 1 ? 's' : ''} need${urgencyData.urgentCount === 1 ? 's' : ''} your attention.`
                : '12 unreads, but they aren\'t urgent at all.'}
            </p>
          </div>
          
          {/* Action Items from Slack */}
          {actionItems.map((item, index) => (
            <div key={item.id} className="card bg-gray-800 text-gray-300">
              <div className="flex -space-x-2 mb-3">
                <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src={`https://randomuser.me/api/portraits/men/${30 + index}.jpg`} alt="User" />
                <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src={`https://randomuser.me/api/portraits/women/${30 + index}.jpg`} alt="User" />
              </div>
              <h3 className="text-indigo-400 text-lg">
                John M. and Debbie J. have Project Atlas under control.
              </h3>
              {item.content && (
                <p className="mt-2 text-sm text-gray-400">
                  {item.content}
                </p>
              )}
            </div>
          ))}
        </div>
        
        {/* Ask anything input */}
        <div className="mt-8 max-w-2xl mx-auto">
          <input
            type="text"
            placeholder="Ask anything"
            className="w-full px-4 py-3 bg-gray-700/30 border-0 rounded-full text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        
        {/* Connection status */}
        <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Synced with your {userProfile?.connections?.slack?.connected ? '5' : '4'} connected apps 1 min ago
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
