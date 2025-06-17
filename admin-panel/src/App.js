import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import toast from 'react-hot-toast';

// Components
import Layout from './components/Layout/Layout';
import Login from './components/Auth/Login';
import Dashboard from './components/Dashboard/Dashboard';
import Collections from './components/Collections/Collections';
import CollectionView from './components/Collections/CollectionView';
import SchemaEditor from './components/Schema/SchemaEditor';
import QueryRunner from './components/Query/QueryRunner';
import BackupRestore from './components/Backup/BackupRestore';
import Settings from './components/Settings/Settings';

// Services
import * as authService from './services/authService';
import * as apiService from './services/apiService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      
      // First check if we have a session
      const storedSessionId = apiService.getSessionId();
      if (storedSessionId) {
        apiService.setSessionId(storedSessionId);
      }
      
      const status = await authService.checkAuthStatus();
      setHasPassword(status.hasPassword);
      setIsAuthenticated(status.authenticated);
      
      // If we have a stored session but it's not authenticated, clear it
      if (!status.authenticated && storedSessionId) {
        apiService.clearSessionId();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Clear any invalid session
      apiService.clearSessionId();
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (password) => {
    try {
      const result = await authService.login(password);
      if (result.success) {
        setIsAuthenticated(true);
        apiService.setSessionId(result.sessionId);
        toast.success('Login successful');
        return true;
      }
      return false;
    } catch (error) {
      toast.error('Login failed: ' + error.message);
      return false;
    }
  };

  const handleSetupPassword = async (password) => {
    try {
      const result = await authService.setupPassword(password);
      if (result.success) {
        setHasPassword(true);
        toast.success('Password set successfully');
        return true;
      }
      return false;
    } catch (error) {
      toast.error('Password setup failed: ' + error.message);
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setIsAuthenticated(false);
      apiService.clearSessionId();
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isLoading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        height="100vh"
      >
        Loading...
      </Box>
    );
  }

  if (!hasPassword || !isAuthenticated) {
    return (
      <Login 
        hasPassword={hasPassword}
        onLogin={handleLogin}
        onSetupPassword={handleSetupPassword}
      />
    );
  }

  return (
    <Layout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:name" element={<CollectionView />} />
        <Route path="/schema/:name" element={<SchemaEditor />} />
        <Route path="/query" element={<QueryRunner />} />
        <Route path="/backup" element={<BackupRestore />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;