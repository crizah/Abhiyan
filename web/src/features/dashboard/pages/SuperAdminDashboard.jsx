import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';
import Leaderboard from '../../../components/Leaderboard';

const { Title, Paragraph, Text } = Typography;

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const { token } = theme.useToken(); // Hooking into global styles
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [orgTeams, setOrgTeams] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardTeamFilter, setLeaderboardTeamFilter] = useState('ALL');

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

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await apiClient.get('/admin/teams');
        setOrgTeams(res.data || []);
      } catch { /* silent */ }
    };
    fetchTeams();
  }, []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const params = leaderboardTeamFilter !== 'ALL' ? { team: leaderboardTeamFilter } : {};
        const res = await apiClient.get('/admin/leaderboard', { params });
        setLeaderboardData(res.data.entries || []);
      } catch { /* silent */ }
      finally { setLeaderboardLoading(false); }
    };
    fetchLeaderboard();
  }, [leaderboardTeamFilter]);

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

        {/* Leaderboard Section */}
        <div style={{ marginTop: '48px' }}>
          <Leaderboard
            entries={leaderboardData}
            loading={leaderboardLoading}
            teamOptions={orgTeams.map(t => ({ value: t.id, label: t.name }))}
            onTeamFilterChange={setLeaderboardTeamFilter}
            teamFilter={leaderboardTeamFilter}
            showVisibilityToggle={false}
          />
        </div>
      </div>
    </div>
  );
}