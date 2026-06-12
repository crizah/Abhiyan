import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';

const { Title, Paragraph, Text } = Typography;

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const { token } = theme.useToken(); // Hooking into global styles
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await apiClient.get('/admin/stats');
        setTotalEmployees(response.data.total_users);
      } catch (error) {
        message.error("Failed to load employee count");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  return (
    <div>
      {/* Page Title Area */}
      <Title level={2} style={{ marginTop: 0 }}>Welcome back, {user?.email}</Title>
      <Paragraph type="secondary">Here is an overview of your organization's system health.</Paragraph>

      {/* Content Area */}
      <div style={{ marginTop: '40px' }}>
        {loading ? (
          <Spin />
        ) : (
          <div style={{ 
            display: 'inline-flex', 
            flexDirection: 'column', 
            gap: '8px',
            padding: '20px 32px',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgLayout
          }}>
            <Text style={{ fontSize: '14px', color: token.colorTextSecondary, fontWeight: 500 }}>
              <TeamOutlined style={{ marginRight: '8px' }} />
              Total Users
            </Text>
            <Text style={{ fontSize: '36px', color: token.colorTextHeading, fontWeight: 600, lineHeight: 1 }}>
              {totalEmployees}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}