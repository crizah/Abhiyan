import React, { useState, useEffect } from 'react';
import { Typography, Spin, message } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';

const { Title, Paragraph, Text } = Typography;

export default function AdminDashboard() {
  const { user } = useAuth();
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        // Hits the new team-specific endpoint!
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
      <Title level={2}>Team Workspace, {user?.email}</Title>
      <Paragraph type="secondary">Here is an overview of the teams you manage.</Paragraph>

      <div style={{ marginTop: '40px' }}>
        {loading ? (
          <Spin />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Text style={{ fontSize: '16px', color: '#000', fontWeight: 500 }}>
              <TeamOutlined style={{ marginRight: '8px' }} />
              Total Team Members
            </Text>
            <Text style={{ fontSize: '36px', color: '#000', fontWeight: 600, lineHeight: 1 }}>
              {totalEmployees}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}