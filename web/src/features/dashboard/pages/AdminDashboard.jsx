import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme, Flex } from 'antd';
import { TeamOutlined, UserOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';
import Leaderboard from '../../../components/Leaderboard';

const { Title, Paragraph, Text } = Typography;

export default function AdminDashboard() {
  const { user } = useAuth();
  const { token } = theme.useToken(); 
  const [stats, setStats] = useState({ total_users: 0, teams: [] });
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardTeamFilter, setLeaderboardTeamFilter] = useState('ALL');
  const [teamVisibility, setTeamVisibility] = useState([]);

useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await apiClient.get('/admin/team-stats');
        const data = response.data || {};
        
        // Explicitly map the properties so teams is guaranteed to be an array
        setStats({
          total_users: data.total_users || 0,
          teams: data.teams || []
        });
      } catch (error) {
        message.error("Failed to load team statistics");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const params = leaderboardTeamFilter !== 'ALL' ? { team: leaderboardTeamFilter } : {};
        const res = await apiClient.get('/admin/leaderboard', { params });
        setLeaderboardData(res.data.entries || []);
        setTeamVisibility(res.data.teams || []);
      } catch {
        // silent
      } finally {
        setLeaderboardLoading(false);
      }
    };
    fetchLeaderboard();
  }, [leaderboardTeamFilter]);

  const handleToggleVisibility = async (teamId, visible) => {
    try {
      await apiClient.put(`/admin/teams/${teamId}/leaderboard-visibility`, { visible });
      setTeamVisibility(prev => prev.map(t =>
        t.team_id === teamId ? { ...t, leaderboard_visible: visible } : t
      ));
      message.success(`Leaderboard ${visible ? 'shown to' : 'hidden from'} employees`);
    } catch {
      message.error('Failed to update visibility');
    }
  };

  return (
    <div>
      {/* Page Title Area */}
      <Title level={2} style={{ marginTop: 0 }}>Team Workspace, {user?.full_name}</Title>
      <Paragraph type="secondary">Here is an overview of the teams you manage.</Paragraph>

      {/* Content Area */}
      <div style={{ marginTop: '40px' }}>
        {loading ? (
          <Spin />
        ) : (
          <>
            {/* Top KPI */}
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
                {stats.total_users}
              </Text>
            </div>
           
            {/* Team Breakdown Grid */}
            <div style={{ marginTop: '48px' }}>
              <Title level={4} style={{ marginBottom: '20px' }}>My Managed Teams</Title>
              
              {stats.teams?.length === 0 ? (
                <div style={{ padding: '40px 0' }}>
                  <Text type="secondary">You are not managing any teams yet.</Text>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {stats.teams?.map(team => (
                    <div key={team.team_id} style={{
                      width: '280px',
                      padding: '20px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: token.borderRadiusLG,
                      backgroundColor: token.colorBgContainer,
                      borderTop: `3px solid ${token.colorPrimary}`, // Subtle accent strip
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'box-shadow 0.2s',
                    }}>
                      {/* Team Header */}
                      <Flex justify="space-between" align="center">
                        <Text strong style={{ fontSize: '16px', color: token.colorTextHeading, lineHeight: 1.3 }}>
                          {team.team_name}
                        </Text>
                        <ApartmentOutlined style={{ fontSize: '16px', color: token.colorTextSecondary }} />
                      </Flex>
                      
                      {/* Team Meta Details */}
                      <Flex vertical gap="6px" style={{ marginTop: '4px' }}>
                        <Text style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                          <UserOutlined style={{ marginRight: '8px' }} /> 
                          {team.member_count} {team.member_count === 1 ? 'Member' : 'Members'}
                        </Text>
                      </Flex>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leaderboard Section */}
            <div style={{ marginTop: '48px' }}>
              <Leaderboard
                entries={leaderboardData}
                loading={leaderboardLoading}
                teamOptions={stats.teams.map(t => ({ value: t.team_id, label: t.team_name }))}
                onTeamFilterChange={setLeaderboardTeamFilter}
                teamFilter={leaderboardTeamFilter}
                showVisibilityToggle={true}
                teamVisibility={teamVisibility}
                onToggleVisibility={handleToggleVisibility}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}