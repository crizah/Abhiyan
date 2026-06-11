// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { customTheme } from './config/theme';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage from './features/auth/pages/LoginPage';
import Dashboard from './features/tasks/pages/Dashboard';
import RegisterOrgPage from './features/auth/pages/RegisterOrgPage';

// A simple wrapper to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return null; // Or a loading spinner
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  return children;
};

export default function App() {
  return (
    <ConfigProvider theme={customTheme}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register-org" element={<RegisterOrgPage />} />
              
              {/* Add the accept-invite route later */}
              {/* <Route path="/accept-invite" element={<AcceptInvitePage />} /> */}

              {/* Protected Routes */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    {<Dashboard />}
                  </ProtectedRoute>
                } 
              />

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}