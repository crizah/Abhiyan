import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';

const { Title, Paragraph, Text } = Typography;

export default function AdminDashboard() {
  const { user } = useAuth();
  const { token } = theme.useToken(); // Hooking into global styles
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await apiClient.get('/admin/team-stats');
        setTotalEmployees(response.data.total_users);
      } catch (error) {
        message.error("Failed to load team employee count");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  return (
    <div>
      {/* Page Title Area */}
      <Title level={2} style={{ marginTop: 0 }}>Team Workspace, {user?.email}</Title>
      <Paragraph type="secondary">Here is an overview of the teams you manage.</Paragraph>

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
              Total Team Members
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