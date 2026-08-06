import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme, Flex } from 'antd';
import { TeamOutlined, ApartmentOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';
import Leaderboard from '../../../components/Leaderboard';
import { useRefetchOnResume, markFetched } from '../../../hooks/useRefetchOnResume';

const { Title, Paragraph, Text } = Typography;

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardTeamFilter, setLeaderboardTeamFilter] = useState('ALL');

  const fetchDashboardData = async () => {
    try {
      const res = await apiClient.get('/employee/teams');
      setTeams(res.data || []);
    } catch (error) {
      message.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      markFetched('employee-teams');
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useRefetchOnResume('employee-teams', fetchDashboardData, { minIntervalMs: 60000 });

  const fetchLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const params = leaderboardTeamFilter !== 'ALL' ? { team: leaderboardTeamFilter } : {};
      const res = await apiClient.get('/leaderboard', { params });
      setLeaderboardData(res.data.entries || []);
    } catch {
      // Leaderboard may not be enabled — silently handle
    } finally {
      setLeaderboardLoading(false);
      markFetched('employee-leaderboard');
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [leaderboardTeamFilter]);

  useRefetchOnResume('employee-leaderboard', fetchLeaderboard, { minIntervalMs: 60000 });

  return (
    <div>
      {/* Page Title Area */}
      <Title level={2} style={{ marginTop: 0 }}>Welcome back, {user?.full_name || 'Team Member'}</Title>
      <Paragraph type="secondary">Here is an overview of your teams.</Paragraph>

      {/* Content Area */}
      <div style={{ marginTop: '40px' }}>
        {loading ? (
          <Spin />
        ) : (
          <>
            {/* KPI Block (Matches SuperAdmin Design) */}
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
                <ApartmentOutlined style={{ marginRight: '8px' }} />
                Total Teams
              </Text>
              <Text style={{ fontSize: '36px', color: token.colorTextHeading, fontWeight: 600, lineHeight: 1 }}>
                {teams.length}
              </Text>
            </div>

            {/* Workspaces Grid */}
            <div style={{ marginTop: '48px' }}>
              <Title level={4} style={{ marginBottom: '20px' }}>My Assigned Teams</Title>
              
              {teams.length === 0 ? (
                <div style={{ padding: '40px 0' }}>
                  <Text type="secondary">You have not been assigned to any teams yet.</Text>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {teams.map(team => (
                    <div key={team.id} style={{
                      width: '280px',
                      padding: '20px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: token.borderRadiusLG,
                      backgroundColor: token.colorBgContainer,
                      borderTop: `3px solid ${token.colorPrimary}`, // Subtle accent strip on top
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'box-shadow 0.2s',
                    }}>
                      {/* Team Header */}
                      <Flex justify="space-between" align="center">
                        <Text strong style={{ fontSize: '16px', color: token.colorTextHeading, lineHeight: 1.3 }}>
                          {team.name}
                        </Text>
                      </Flex>
                      
                      {/* Team Meta Details */}
                      <Flex vertical gap="6px" style={{ marginTop: '4px' }}>
                        <Text style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                          <UserOutlined style={{ marginRight: '8px' }} /> 
                          {team.member_count} {team.member_count === 1 ? 'Member' : 'Members'}
                        </Text>
                        <Text style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                          <TeamOutlined style={{ marginRight: '8px' }} />
                          Role: <Text strong style={{ color: token.colorText }}>{team.role?.replace('_', ' ')}</Text>
                        </Text>
                      </Flex>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leaderboard Section — only shown if data is available */}
            {(leaderboardData.length > 0 || leaderboardLoading) && (
              <div style={{ marginTop: '48px' }}>
                <Leaderboard
                  entries={leaderboardData}
                  loading={leaderboardLoading}
                  currentUserId={user?.user_id}
                  teamOptions={teams.map(t => ({ value: t.id, label: t.name }))}
                  onTeamFilterChange={setLeaderboardTeamFilter}
                  teamFilter={leaderboardTeamFilter}
                  showVisibilityToggle={false}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}