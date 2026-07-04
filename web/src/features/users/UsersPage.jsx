import React, { useState, useEffect } from 'react';
import { Table, Input, Select, Typography, Tag, Avatar, Flex, message, ConfigProvider, Button, Card, Divider, Popconfirm, Tooltip } from 'antd';
import { UserOutlined, SearchOutlined, SettingOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../utils/colorMaps';
import ScoreBreakdown from '../../components/ScoreBreakdown';
import InfoTooltip from '../../components/InfoTooltip';
import { SlidingCardModal } from '../../components/SlidingCardModal';

const { Title, Text } = Typography;

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]); // Restored teams state
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Manage User modal controls
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [systemRole, setSystemRole] = useState('');
  const [accountStatus, setAccountStatus] = useState('');

  // Cross-Team State
  const [userTeams, setUserTeams] = useState([]);
  const [teamToAssign, setTeamToAssign] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingUserReport, setDownloadingUserReport] = useState(false);

  // Fetch teams once on mount
  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchText, roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/admin/teams');
      setTeams(res.data || []);
    } catch (err) {
      message.error("Failed to load organization teams.");
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/users', {
        params: { page: currentPage, pageSize, search: searchText, role: roleFilter, status: statusFilter }
      });
      setUsers(response.data.users || []);
      setTotalUsers(response.data.total_count || 0);
    } catch (error) {
      message.error("Failed to load users data.");
    } finally {
      setLoading(false);
    }
  };

  const openUserDrawer = (user) => {
    setSelectedUser(user);
    setSystemRole(user.roles?.[0] || 'EMPLOYEE');
    setAccountStatus(user.status || 'ACTIVE');
    setIsManageOpen(true);
    fetchUserTeams(user.id); // Fetch their teams
  };

  // --- SYSTEM PROFILE LOGIC ---
  const handleSaveSystemProfile = async () => {
    try {
      await apiClient.put(`/admin/users/${selectedUser.id}/system-profile`, {
        role: systemRole,
        status: accountStatus
      });
      message.success("System configurations saved.");
      
      // OPTIMISTIC UPDATE
      setUsers(prevUsers => prevUsers.map(u => 
        u.id === selectedUser.id 
          ? { ...u, status: accountStatus, roles: [systemRole] } 
          : u
      ));

      setIsManageOpen(false);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to update system access profile.");
    }
  };

  // --- CROSS-TEAM LOGIC ---
  const fetchUserTeams = async (userId) => {
    try {
      const res = await apiClient.get(`/admin/users/${userId}/teams`);
      setUserTeams(res.data || []);
    } catch (err) {
      message.error("Failed to load user teams");
    }
  };

  const handleAssignToAdditionalTeam = async () => {
    if (!teamToAssign) return;
    try {
      await apiClient.post(`/admin/teams/${teamToAssign}/members`, { user_id: selectedUser.id, team_role: 'MEMBER' });
      message.success("Assigned to additional team!");
      setTeamToAssign(null);
      fetchUserTeams(selectedUser.id);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to assign team relation.");
    }
  };

  const updateTeamRole = async (teamId, newRole) => {
    try {
      await apiClient.post(`/admin/teams/${teamId}/members`, { user_id: selectedUser.id, team_role: newRole });
      message.success("Team role updated");
      fetchUserTeams(selectedUser.id);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to update role");
    }
  };

  const handleDownloadOrgReport = async () => {
    setDownloadingReport(true);
    try {
      const res = await apiClient.get('/admin/reports/score-download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'org_performance_report.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleDownloadUserReport = async () => {
    if (!selectedUser) return;
    setDownloadingUserReport(true);
    try {
      const res = await apiClient.get('/admin/reports/score-download', {
        params: { user_id: selectedUser.id },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `score_report_${selectedUser.id.slice(0, 8)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloadingUserReport(false);
    }
  };

  const removeTeamMember = async (teamId) => {
    try {
      await apiClient.delete(`/admin/teams/${teamId}/members/${selectedUser.id}`);
      message.success("Removed from team.");
      fetchUserTeams(selectedUser.id);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to remove member.");
    }
  };

  // --- TABLE COLUMNS ---
  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, record) => (
        <Flex align="center" gap="12px">
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#bfbfbf' }} />
          <Flex vertical>
            <Text strong>{record.full_name}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>{record.email_id}</Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: 'Roles',
      key: 'roles',
      dataIndex: 'roles',
      render: (roles) => (
        <>
          {(roles || []).map(role => (
            <Tag color={ROLE_COLORS[role] || 'default'} key={role}>
              {formatRole(role)}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={STATUS_COLORS[status] || 'default'}>{status}</Tag>,
    },
    {
      title: 'Action',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Button type="default" size="small" icon={<SettingOutlined />} onClick={() => openUserDrawer(record)}>
          Manage User
        </Button>
      ),
    },
  ];

  const userDrawerColumns = [
    { title: 'Team', dataIndex: 'team_name', key: 'name', render: text => <Text strong>{text}</Text> },
    { 
      title: 'Role', dataIndex: 'team_role', key: 'role',
      render: (role, record) => (
        <Select 
          value={role} style={{ width: 130 }} 
          onChange={(val) => updateTeamRole(record.team_id, val)}
          options={[{ value: 'TEAM_ADMIN', label: 'Team Admin' }, { value: 'MEMBER', label: 'Member' }]}
        />
      )
    },
    { 
      title: '', key: 'action',
      render: (_, record) => (
        <Popconfirm title="Remove from this team?" onConfirm={() => removeTeamMember(record.team_id)}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: '16px' }}>
        <Title level={3} style={{ margin: 0 }}>Users Directory</Title>
        <Tooltip title="Apply filters and generate performance reports for all employees within the filter">
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadOrgReport}
            loading={downloadingReport}
            style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
          >
            Performance Report
          </Button>
        </Tooltip>
      </Flex>

      <Flex wrap="wrap" gap={12} style={{ marginBottom: '24px' }} align="center">
        <ConfigProvider theme={{ components: { Input: { activeBorderColor: '#B3455C', hoverBorderColor: '#B3455C' } } }}>
          <Input
            placeholder="Search by name or email..."
            prefix={<SearchOutlined />}
            style={{ flex: '1 1 220px', minWidth: 200 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </ConfigProvider>

        <Select defaultValue="ALL" style={{ flex: '1 1 150px', minWidth: 140 }} onChange={setRoleFilter}
          options={[
            { value: 'ALL', label: 'All Roles' },
            { value: 'SUPER_ADMIN', label: 'Super Admin' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'EMPLOYEE', label: 'Employee' },
          ]}
        />

        <Select defaultValue="ALL" style={{ flex: '1 1 150px', minWidth: 140 }} onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: 'All Statuses' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INVITED', label: 'Invited' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
      </Flex>

      <Table 
        columns={columns} 
        dataSource={users} 
        rowKey="id" 
        loading={loading}
        onChange={(p) => { setCurrentPage(p.current); setPageSize(p.pageSize); }}
        pagination={{ current: currentPage, pageSize, total: totalUsers, showSizeChanger: true }}
      />

      {/* MANAGE USER — same sliding pill-tab card pattern as the task details panel */}
      <SlidingCardModal
        open={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        title={selectedUser ? `Manage User: ${selectedUser.full_name}` : 'Manage User'}
        resetKey={selectedUser?.id}
        defaultWidth={640}
        tabs={[
          {
            key: 'account',
            label: 'Account',
            content: (
              <div>
                <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                  <Title level={5} style={{ margin: 0 }}>System Account Controls</Title>
                  <InfoTooltip title="Control users system roles here" />
                </Flex>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 20 }}>
                  Set this user's system-wide access role and whether their account is active.
                </Text>
                <Flex vertical gap="middle">
                  <Flex align="center" justify="space-between">
                    <Text>System Access Role:</Text>
                    <Select value={systemRole} style={{ width: 220 }} onChange={setSystemRole}
                      options={[{ value: 'SUPER_ADMIN', label: 'Super Admin' }, { value: 'ADMIN', label: 'Admin' }, { value: 'EMPLOYEE', label: 'Employee' }]}
                    />
                  </Flex>
                  <Flex align="center" justify="space-between">
                    <Text>Account Operational Status:</Text>
                    <Select value={accountStatus} style={{ width: 220 }} onChange={setAccountStatus}
                      options={[
                        { value: 'ACTIVE', label: 'Active State' },
                        { value: 'SUSPENDED', label: 'Suspended (Blocked)' },
                        { value: 'INVITED', label: 'Invited (Pending)', disabled: true }
                      ]}
                    />
                  </Flex>
                  <Button
                    onClick={handleSaveSystemProfile}
                    style={{ alignSelf: 'flex-end', marginTop: 8, background: '#B3455C', border: 'none', color: '#FFFFFF' }}
                  >
                    Save Account Status Changes
                  </Button>
                </Flex>
              </div>
            ),
          },
          {
            key: 'teams',
            label: 'Teams',
            content: (
              <div>
                <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                  <Title level={5} style={{ margin: 0 }}>Cross-Team Memberships</Title>
                  <InfoTooltip title="Manage users team here, add to another team or remove from existing" />
                </Flex>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                  Teams this user currently belongs to, with the ability to add or remove memberships.
                </Text>
                <Flex gap="small" align="center" style={{ marginBottom: '16px' }}>
                  <Select
                    placeholder="Add to another team..." style={{ flex: 1 }}
                    value={teamToAssign} onChange={setTeamToAssign}
                    options={teams.filter(t => !userTeams.some(ut => ut.team_id === t.id)).map(t => ({ label: t.name, value: t.id }))}
                  />
                  <Button type="default" disabled={!teamToAssign} onClick={handleAssignToAdditionalTeam}>
                    Add to Team
                  </Button>
                </Flex>
                <Table columns={userDrawerColumns} dataSource={userTeams} rowKey="team_id" pagination={false} size="small" />
              </div>
            ),
          },
          {
            key: 'performance',
            label: 'Performance',
            content: (
              <div>
                <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                  <Title level={5} style={{ margin: 0 }}>Performance Overview</Title>
                  <InfoTooltip title="Performance overview of completed tasks" />
                </Flex>
                <Card size="small" style={{ backgroundColor: '#fafafa', border: 'none', borderRadius: 10, margin: '12px 0 20px' }}>
                  <Text style={{ fontSize: 12 }}>
                    Points are only granted once a task is approved. <Text strong style={{ fontSize: 12 }}>On-time completions</Text> earn a base of 10 points, plus up to 5 bonus points the earlier it's finished ahead of the due date (15 max). <Text strong style={{ fontSize: 12 }}>Late completions</Text> (approved after the due date) earn a flat 3 points. <Text strong style={{ fontSize: 12 }}>Missed deadlines</Text> and <Text strong style={{ fontSize: 12 }}>rejected submissions</Text> earn 0 points.
                  </Text>
                </Card>

                {selectedUser && (
                  <ScoreBreakdown userId={selectedUser.id} basePath="/admin/users" showDownload={false} />
                )}

                <Divider />

                <Card size="small" style={{ border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 10 }}>
                  <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                    <DownloadOutlined style={{ color: '#B3455C' }} />
                    <Text strong style={{ fontSize: 14 }}>Download Report</Text>
                    <InfoTooltip title="This generates the performance report for this user in CSV format." />
                  </Flex>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Export this user's completed task history and points as a CSV file.
                  </Text>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={handleDownloadUserReport}
                    loading={downloadingUserReport}
                    style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
                  >
                    Download CSV
                  </Button>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}