import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Connections from './pages/Connections';
import SlackCallback from './pages/SlackCallback';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

function App() {
  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* Protected Routes */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/connections" 
        element={
          <ProtectedRoute>
            <Connections />
          </ProtectedRoute>
        } 
      />
      
      {/* Slack OAuth Callback */}
      <Route path="/slack/oauth/callback" element={<SlackCallback />} />
      
      {/* Fallback Route */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
