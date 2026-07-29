import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme, Switch, Card, Flex } from 'antd';
import { TeamOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';
import Leaderboard from '../../../components/Leaderboard';
import InfoTooltip from '../../../components/InfoTooltip';
import { attendanceAPI } from '../../auth/api';

const { Title, Paragraph, Text } = Typography;

export default function SuperAdminDashboard() {
  const { user, login } = useAuth();
  const { token } = theme.useToken();
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [orgTeams, setOrgTeams] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardTeamFilter, setLeaderboardTeamFilter] = useState('ALL');
  const [attendanceToggling, setAttendanceToggling] = useState(false);

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

  const handleAttendanceToggle = async (enabled) => {
    setAttendanceToggling(true);
    try {
      await attendanceAPI.toggleAttendance(enabled);
      // Re-fetch the user context so attendance_enabled + face_registered are fresh
      await login();
      message.success(enabled ? 'Attendance tracking enabled.' : 'Attendance tracking disabled.');
    } catch {
      message.error('Failed to update attendance settings.');
    } finally {
      setAttendanceToggling(false);
    }
  };

  return (
    <div>
      {/* Page Title Area */}
      <Title level={2} style={{ marginTop: 0 }}>Welcome back, {user?.full_name}</Title>
      <Paragraph type="secondary">Here is an overview of your organization's system health.</Paragraph>

      {/* Content Area: main column + leaderboard rail */}
      <Flex gap={token.marginXL} align="flex-start" wrap="wrap" style={{ marginTop: '40px' }} className="dash-columns">
        <div style={{ flex: '1 1 320px', minWidth: 0 }} className="dash-col-main">
          <Flex gap={token.marginLG} vertical>
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

            {/* Attendance Toggle Card */}
            <Card
              size="small"
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                backgroundColor: token.colorBgLayout,
                minWidth: 240,
              }}
            >
              <Flex vertical gap={8}>
                <Flex align="center" gap={8}>
                  <ClockCircleOutlined style={{ color: token.colorPrimary }} />
                  <Text strong style={{ fontSize: '14px' }}>Attendance Tracking</Text>
                  <InfoTooltip title="Turning this on means attendance will be tracked for your organization from now on." />
                </Flex>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {user?.attendance_enabled
                    ? 'Attendance is being recorded on login.'
                    : 'Enable to track daily login-based attendance.'}
                </Text>
                <Switch
                  checked={!!user?.attendance_enabled}
                  loading={attendanceToggling}
                  onChange={handleAttendanceToggle}
                  checkedChildren="On"
                  unCheckedChildren="Off"
                />
              </Flex>
            </Card>
          </Flex>
        </div>

        {/* Leaderboard rail */}
        <div style={{ flex: '0 1 360px', width: '100%', maxWidth: 360 }} className="dash-col-rail">
          <Leaderboard
            entries={leaderboardData}
            loading={leaderboardLoading}
            teamOptions={orgTeams.map(t => ({ value: t.id, label: t.name }))}
            onTeamFilterChange={setLeaderboardTeamFilter}
            teamFilter={leaderboardTeamFilter}
            showVisibilityToggle={false}
          />
        </div>
      </Flex>

      <style>{`
        @media (max-width: 640px) {
          .dash-col-main, .dash-col-rail {
            flex-basis: 100% !important;
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}