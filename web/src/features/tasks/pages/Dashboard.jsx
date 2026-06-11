import React from 'react';
import { Typography, Flex } from 'antd';
import { useAuth } from '../../../context/AuthContext';

const { Title } = Typography;

export default function Dashboard() {
  const { user } = useAuth();

  // If the user object isn't loaded yet, return null or a spinner
  if (!user) return null;

  // 1. Super Admin View
  if (user.role === 'SUPERADMIN') {
    return (
      <Flex vertical padding="24px">
        <Title level={2}>Super Admin Dashboard</Title>
        <p>Welcome, {user.email}. Here you can manage the entire organization, view billing, and manage admins.</p>
        {/* <SuperAdminOrgSettings /> */}
      </Flex>
    );
  }

  // 2. Admin View
  if (user.role === 'ADMIN') {
    return (
      <Flex vertical padding="24px">
        <Title level={2}>Admin Workspace</Title>
        <p>Welcome, {user.email}. Here you can invite employees and manage team tasks.</p>
        {/* <AdminTaskBoard /> */}
      </Flex>
    );
  }

  // 3. Standard Employee View
  return (
    <Flex vertical padding="24px">
      <Title level={2}>My Tasks</Title>
      <p>Welcome back, {user.email}. Here are your assigned tasks for today.</p>
      {/* <EmployeeTaskBoard /> */}
    </Flex>
  );
}