import React, { useState, useEffect } from 'react';
import { Table, Input, Select, Typography, Tag, Avatar, Flex, message, ConfigProvider, Button, Drawer, Divider, Popconfirm } from 'antd';
import { UserOutlined, SearchOutlined, SettingOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../utils/colorMaps';
import ScoreBreakdown from '../../components/ScoreBreakdown';

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

  // Drawer Controls
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [systemRole, setSystemRole] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  
  // Cross-Team State
  const [userTeams, setUserTeams] = useState([]);
  const [teamToAssign, setTeamToAssign] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

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
    setIsDrawerOpen(true);
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

      setIsDrawerOpen(false);
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
      <Title level={3}>Users Directory</Title>

      <Flex gap="middle" style={{ marginBottom: '24px' }} align="center">
        <ConfigProvider theme={{ components: { Input: { activeBorderColor: '#B3455C', hoverBorderColor: '#B3455C' } } }}>
          <Input
            placeholder="Search by name or email..."
            prefix={<SearchOutlined />}
            style={{ width: '300px' }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </ConfigProvider>

        <Select defaultValue="ALL" style={{ width: 150 }} onChange={setRoleFilter}
          options={[
            { value: 'ALL', label: 'All Roles' },
            { value: 'SUPER_ADMIN', label: 'Super Admin' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'EMPLOYEE', label: 'Employee' },
          ]}
        />

        <Select defaultValue="ALL" style={{ width: 150 }} onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: 'All Statuses' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INVITED', label: 'Invited' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />

        <Button
          icon={<DownloadOutlined />}
          onClick={handleDownloadOrgReport}
          loading={downloadingReport}
          style={{ marginLeft: 'auto', background: '#B3455C', border: 'none', color: '#FFFFFF' }}
        >
          Performance Report
        </Button>
      </Flex>

      <Table 
        columns={columns} 
        dataSource={users} 
        rowKey="id" 
        loading={loading}
        onChange={(p) => { setCurrentPage(p.current); setPageSize(p.pageSize); }}
        pagination={{ current: currentPage, pageSize, total: totalUsers, showSizeChanger: true }}
      />

      {/* SYSTEM AND MEMBERSHIP MANAGEMENT DRAWER */}
      <Drawer
        title={selectedUser ? `Manage User: ${selectedUser.full_name}` : 'Manage User'}
        placement="right" width={500} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen}
      >
        <Text strong>System Account Controls</Text>
        <Flex vertical gap="medium" style={{ marginTop: '12px', marginBottom: '20px' }}>
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
          <Button type="primary" onClick={handleSaveSystemProfile} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
            Save Account Status Changes
          </Button>
        </Flex>

        <Divider />

        <Text strong style={{ display: 'block', marginBottom: '12px' }}>Cross-Team Memberships</Text>
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

        <Divider />

        <Text strong style={{ display: 'block', marginBottom: '12px' }}>Performance Overview</Text>
        {selectedUser && (
          <ScoreBreakdown userId={selectedUser.id} basePath="/admin/users" />
        )}
      </Drawer>
    </div>
  );
}