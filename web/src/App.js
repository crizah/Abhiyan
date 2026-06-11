// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { customTheme } from './config/theme';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages & Layouts
import LoginPage from './features/auth/pages/LoginPage';
import RegisterOrgPage from './features/auth/pages/RegisterOrgPage';
import AppLayout from './layouts/AppLayout';
import SuperAdminDashboard from './features/dashboard/pages/SuperAdminDashboard';

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
              {/* --- Public Routes --- */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register-org" element={<RegisterOrgPage />} />
              
              {/* Add the accept-invite route later */}
              {/* <Route path="/accept-invite" element={<AcceptInvitePage />} /> */}

              {/* --- Protected App Routes --- */}
              {/* Anything inside this block gets wrapped by the Sidebar and Header! */}
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Automatically redirect the base "/" to "/dashboard" */}
                <Route index element={<Navigate to="dashboard" replace />} />
                
                {/* The Dashboards */}
                {/* Note: We will eventually add a Router here to render different dashboards based on role, 
                    but for now, we render the SuperAdminDashboard */}
                <Route path="dashboard" element={<SuperAdminDashboard />} />

                {/* Future Routes go here, inside the Layout! */}
                {/* <Route path="users" element={<UserManagement />} /> */}
                {/* <Route path="tasks" element={<TaskBoard />} /> */}
              </Route>

              {/* Default catch-all redirect */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}