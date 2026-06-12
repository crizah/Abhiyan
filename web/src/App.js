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
import UserProfilePage from './features/users/UserProfilePage'
import TeamEmployeesPage from './features/users/TeamEmployeesPage';

// Dashboards
import SuperAdminDashboard from './features/dashboard/pages/SuperAdminDashboard';
import AdminDashboard from './features/dashboard/pages/AdminDashboard';
import EmployeeDashboard from './features/dashboard/pages/EmployeeDashboard';
import UsersPage from './features/users/UsersPage'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return null; 
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  return children;
};

// Dynamically routes the user to their specific dashboard based on active role
const DashboardRouter = () => {
  const { user } = useAuth();
  const role = (user?.role || '').toUpperCase();

  if (role === 'SUPER_ADMIN') return <SuperAdminDashboard />;
  if (role === 'ADMIN') return <AdminDashboard />;
  return <EmployeeDashboard />;
};

export default function App() {
  return (
    <ConfigProvider theme={customTheme}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register-org" element={<RegisterOrgPage />} />
              
              <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardRouter />} />
                <Route path="profile" element={<UserProfilePage />} />
                <Route path="users" element={<UsersPage/>} />
                <Route path="employees" element={<TeamEmployeesPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}