import React from 'react';
import { Typography, Flex, Button } from 'antd'; // <-- Import Button
import { LogoutOutlined } from '@ant-design/icons'; // <-- Import the icon
import { useAuth } from '../../../context/AuthContext';

const { Title } = Typography;

export default function Dashboard() {
  const { user, logout } = useAuth(); // <-- Grab the logout function from context

  if (!user) return null;

  const userRole = (user.role || '').toLowerCase();

  // A reusable header for all dashboard views
  const DashboardHeader = () => (
    <Flex justify="space-between" align="center" style={{ marginBottom: '24px' }}>
      <Title level={2} style={{ margin: 0 }}>
        {userRole === 'super_admin' ? 'Super Admin Dashboard' : 
         userRole === 'admin' ? 'Admin Workspace' : 'My Tasks'}
      </Title>
      <Button 
        type="default" 
        danger 
        icon={<LogoutOutlined />} 
        onClick={logout}
      >
        Sign Out
      </Button>
    </Flex>
  );

  // 1. Super Admin View
  if (userRole === 'super_admin' || userRole === 'superadmin') {
    return (
      <Flex vertical style={{ padding: '24px' }}>
        <DashboardHeader />
        <p>Welcome, {user.email || 'Admin'}. Here you can manage the entire organization, view billing, and manage admins.</p>
      </Flex>
    );
  }

  // 2. Admin View
  if (userRole === 'admin') {
    return (
      <Flex vertical style={{ padding: '24px' }}>
        <DashboardHeader />
        <p>Welcome, {user.email || 'Manager'}. Here you can invite employees and manage team tasks.</p>
      </Flex>
    );
  }

  // 3. Standard Employee View
  return (
    <Flex vertical style={{ padding: '24px' }}>
      <DashboardHeader />
      <p>Welcome back, {user.email || 'Team Member'}. Here are your assigned tasks for today.</p>
    </Flex>
  );
}