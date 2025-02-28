import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

function Header() {
  const { currentUser, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };
  
  return (
    <header className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Navigation */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-white"></div>
              </div>
              <span className="ml-2 text-xl font-medium text-gray-900 dark:text-white">Synth</span>
            </Link>
            
            <nav className="ml-10 hidden md:flex space-x-6">
              <Link 
                to="/" 
                className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 px-3 py-2 text-sm font-medium"
              >
                Discover
              </Link>
              <Link 
                to="/perspective" 
                className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 px-3 py-2 text-sm font-medium"
              >
                Perspective
              </Link>
              <Link 
                to="/connections" 
                className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 px-3 py-2 text-sm font-medium"
              >
                Connections
              </Link>
            </nav>
          </div>
          
          {/* User Menu */}
          <div className="flex items-center">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {darkMode ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12z" clipRule="evenodd"></path>
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                </svg>
              )}
            </button>
            
            {/* User Avatar */}
            <div className="ml-4 relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center focus:outline-none"
              >
                <span className="sr-only">Open user menu</span>
                <img
                  className="h-8 w-8 rounded-full"
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                    currentUser?.displayName || 'User'
                  )}&background=6366f1&color=fff`}
                  alt={currentUser?.displayName || 'User'}
                />
              </button>
              
              {/* User Dropdown */}
              {userMenuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black/5 dark:ring-white/5">
                  <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                    <div className="font-medium">{currentUser?.displayName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {currentUser?.email}
                    </div>
                  </div>
                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Your Profile
                  </Link>
                  <Link
                    to="/settings"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
