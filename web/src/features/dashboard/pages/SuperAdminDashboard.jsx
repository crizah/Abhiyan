import React, { useState, useEffect } from 'react';
import { Typography, Spin, message, theme, Switch, Card, Flex, Button, Modal, Tag } from 'antd';
import { TeamOutlined, ClockCircleOutlined, WarningOutlined, ScanOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../config/axios';
import Leaderboard from '../../../components/Leaderboard';
import InfoTooltip from '../../../components/InfoTooltip';
import ResponsiveTable from '../../../components/ResponsiveTable';
import { attendanceAPI, orgAPI } from '../../auth/api';

const { Title, Paragraph, Text } = Typography;

export default function SuperAdminDashboard() {
  const { user, login, logout } = useAuth();
  const { token } = theme.useToken();
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [orgTeams, setOrgTeams] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardTeamFilter, setLeaderboardTeamFilter] = useState('ALL');
  const [attendanceToggling, setAttendanceToggling] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [faceStatus, setFaceStatus] = useState([]);
  const [faceStatusLoading, setFaceStatusLoading] = useState(true);

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

  useEffect(() => {
    if (!user?.attendance_enabled) {
      setFaceStatusLoading(false);
      return;
    }
    const fetchFaceStatus = async () => {
      setFaceStatusLoading(true);
      try {
        const res = await orgAPI.getFaceRegistrationStatus();
        setFaceStatus(res || []);
      } catch {
        message.error('Failed to load face registration status');
      } finally {
        setFaceStatusLoading(false);
      }
    };
    fetchFaceStatus();
  }, [user?.attendance_enabled]);

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

  const handleDeleteOrg = () => {
    Modal.confirm({
      title: 'Delete this organisation?',
      icon: <WarningOutlined style={{ color: token.colorError }} />,
      content: 'Deleting this organisation will permanently remove all its data, are you sure you want to continue?',
      okText: 'Delete',
      okButtonProps: { danger: true, loading: deletingOrg },
      cancelText: 'Cancel',
      onOk: async () => {
        setDeletingOrg(true);
        try {
          await orgAPI.deleteOrganization();
          message.success('Organisation deleted.');
          logout();
        } catch {
          message.error('Failed to delete organisation.');
        } finally {
          setDeletingOrg(false);
        }
      },
    });
  };

  const faceStatusColumns = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Flex vertical>
          <Text strong>{r.full_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.email_id}</Text>
        </Flex>
      ),
    },
    {
      title: 'Face Registered',
      dataIndex: 'face_registered',
      key: 'face_registered',
      render: (registered) => (
        registered ? <Tag color="success">Yes</Tag> : <Tag color="error">No</Tag>
      ),
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value, record) => record.face_registered === value,
    },
  ];

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

            {/* Danger Zone Card */}
            <Card
              size="small"
              style={{
                border: `1px solid ${token.colorErrorBorder}`,
                borderRadius: token.borderRadiusLG,
                backgroundColor: token.colorErrorBg,
                minWidth: 240,
              }}
            >
              <Flex vertical gap={8}>
                <Flex align="center" gap={8}>
                  <WarningOutlined style={{ color: token.colorError }} />
                  <Text strong style={{ fontSize: '14px', color: token.colorError }}>Danger Zone</Text>
                </Flex>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Permanently delete this organisation and all of its data. This cannot be undone.
                </Text>
                <Button
                  danger
                  block
                  loading={deletingOrg}
                  onClick={handleDeleteOrg}
                >
                  Delete this organisation
                </Button>
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

      {/* Face Registration Status */}
      {user?.attendance_enabled && (
        <Card
          style={{
            marginTop: token.marginXL,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgLayout,
          }}
        >
          <Flex align="center" gap={8} style={{ marginBottom: token.marginSM }}>
            <ScanOutlined style={{ color: token.colorPrimary }} />
            <Text strong style={{ fontSize: '14px' }}>Face Registration Status</Text>
            <InfoTooltip title="Users need to register their face before attendance can be tracked for them." />
          </Flex>
          <ResponsiveTable
            rowKey="id"
            columns={faceStatusColumns}
            primaryColumnKeys={['user']}
            dataSource={faceStatus}
            loading={faceStatusLoading}
            pagination={{ pageSize: 10 }}
            size="middle"
          />
        </Card>
      )}

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