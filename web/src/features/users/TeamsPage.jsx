import React, { useState, useEffect } from 'react';
import { Typography, Tabs, Card, Button, Table, Flex, Drawer, Select, message, Modal, Input, Badge, Popconfirm, Divider } from 'antd';
import { TeamOutlined, PlusOutlined, UserAddOutlined, DeleteOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';

const { Title, Text } = Typography;

// ─── responsive helpers ───────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return width;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const drawerWidth = isMobile ? '100%' : Math.min(Math.round(windowWidth * 0.7), 700);

  const [activeTab, setActiveTab] = useState('1');
  const [teams, setTeams] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination: Assigned Users (Tab 2)
  const [assignedPage, setAssignedPage] = useState(1);
  const [assignedPageSize, setAssignedPageSize] = useState(10);
  const [assignedTotal, setAssignedTotal] = useState(0);

  // Pagination: Unassigned Queue (Tab 3)
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [unassignedPageSize, setUnassignedPageSize] = useState(10);
  const [unassignedTotal, setUnassignedTotal] = useState(0);

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  // Drawer 1: Manage Team Members
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [isTeamDrawerOpen, setIsTeamDrawerOpen] = useState(false);

  // Drawer 2: Manage User Teams
  const [selectedUser, setSelectedUser] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [teamToAssign, setTeamToAssign] = useState(null);

  // Unassigned Queue State
  const [pendingAssignments, setPendingAssignments] = useState({});

  useEffect(() => {
    fetchAllData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAssignedUsers = async (page, limit) => {
    const res = await apiClient.get('/admin/users/assigned', { params: { page, limit } });
    setAssignedUsers(res.data.users || []);
    setAssignedTotal(res.data.total_count || 0);
  };

  const fetchUnassignedUsers = async (page, limit) => {
    const res = await apiClient.get('/admin/users/unassigned', { params: { page, limit } });
    setUnassignedUsers(res.data.users || []);
    setUnassignedTotal(res.data.total_count || 0);
  };

  // Called on mount and after any mutation — always resets both user lists to page 1
  const fetchAllData = async () => {
    setLoading(true);
    setAssignedPage(1);
    setUnassignedPage(1);
    try {
      const [teamsRes] = await Promise.all([
        apiClient.get('/admin/teams'),
        fetchAssignedUsers(1, assignedPageSize),
        fetchUnassignedUsers(1, unassignedPageSize),
      ]);
      setTeams(teamsRes.data || []);
    } catch (err) {
      message.error('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  // --- TEAM CREATION ---
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      await apiClient.post('/admin/teams', { name: newTeamName });
      message.success('Team created successfully');
      setIsCreateModalOpen(false);
      setNewTeamName('');
      fetchAllData();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create team');
    }
  };

  // --- DRAWER 1: MANAGE TEAM MEMBERS ---
  const openTeamDrawer = async (team) => {
    setSelectedTeam(team);
    setIsTeamDrawerOpen(true);
    fetchTeamMembers(team.id);
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const res = await apiClient.get(`/admin/teams/${teamId}/members`);
      setTeamMembers(res.data || []);
    } catch (err) {
      message.error('Failed to load team members');
    }
  };

  const updateMemberRole = async (userId, teamId, newRole, refreshType) => {
    try {
      await apiClient.post(`/admin/teams/${teamId}/members`, { user_id: userId, team_role: newRole });
      message.success('Role updated');
      if (refreshType === 'TEAM') fetchTeamMembers(teamId);
      if (refreshType === 'USER') fetchUserTeams(userId);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const removeMember = async (userId, teamId, refreshType) => {
    try {
      await apiClient.delete(`/admin/teams/${teamId}/members/${userId}`);
      message.success('Removed from team');
      if (refreshType === 'TEAM') fetchTeamMembers(teamId);
      if (refreshType === 'USER') fetchUserTeams(userId);
      fetchAllData();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to remove member');
    }
  };

  // --- DRAWER 2: MANAGE USER TEAMS ---
  const openUserDrawer = async (user) => {
    setSelectedUser(user);
    setIsUserDrawerOpen(true);
    fetchUserTeams(user.id);
  };

  const fetchUserTeams = async (userId) => {
    try {
      const res = await apiClient.get(`/admin/users/${userId}/teams`);
      setUserTeams(res.data || []);
    } catch (err) {
      message.error('Failed to load user teams');
    }
  };

  const handleAssignToAdditionalTeam = async () => {
    if (!teamToAssign) return;
    try {
      await apiClient.post(`/admin/teams/${teamToAssign}/members`, { user_id: selectedUser.id, team_role: 'MEMBER' });
      message.success('Added to team!');
      setTeamToAssign(null);
      fetchUserTeams(selectedUser.id);
      fetchAllData();
    } catch (err) {
      message.error('Failed to assign team.');
    }
  };

  // --- TAB 3: UNASSIGNED QUEUE ---
  const handleQueueDropdownChange = (userId, teamId) => {
    setPendingAssignments((prev) => ({ ...prev, [userId]: teamId }));
  };

  const executeQueueAssignment = async (userId) => {
    const teamId = pendingAssignments[userId];
    if (!teamId) return;
    try {
      await apiClient.post(`/admin/teams/${teamId}/members`, { user_id: userId, team_role: 'MEMBER' });
      message.success('User assigned to team!');
      setPendingAssignments((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      fetchAllData();
    } catch (err) {
      message.error('Failed to assign user.');
    }
  };

  // --- TABLE COLUMNS ---
  const teamColumns = [
    {
      title: 'Team Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Total Members',
      dataIndex: 'member_count',
      key: 'count',
      responsive: ['sm'],   // hide on xs (mobile)
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button
          type="default"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => openTeamDrawer(record)}
        >
          {isMobile ? null : 'Manage Members'}
        </Button>
      ),
    },
  ];

  const assignedUserColumns = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email_id',
      key: 'email',
      responsive: ['sm'],
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button
          type="default"
          size="small"
          icon={<UserOutlined />}
          onClick={() => openUserDrawer(record)}
        >
          {isMobile ? null : 'Manage User'}
        </Button>
      ),
    },
  ];

  const unassignedColumns = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email_id',
      key: 'email',
      responsive: ['sm'],
    },
    {
      title: 'Assign To',
      key: 'assign',
      render: (_, record) => (
        <Flex gap="small" align="center" wrap="wrap">
          <Select
            placeholder="Select Team"
            style={{ width: isMobile ? '100%' : 160, minWidth: 120 }}
            value={pendingAssignments[record.id]}
            onChange={(val) => handleQueueDropdownChange(record.id, val)}
            options={teams.map((t) => ({ label: t.name, value: t.id }))}
          />
          <Button
            type="primary"
            size="small"
            disabled={!pendingAssignments[record.id]}
            onClick={() => executeQueueAssignment(record.id)}
          >
            Assign
          </Button>
        </Flex>
      ),
    },
  ];

  // Drawer 1 Columns
  const teamDrawerColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name' },
    {
      title: 'Role',
      dataIndex: 'team_role',
      key: 'role',
      render: (role, record) => (
        <Select
          value={role}
          style={{ width: isMobile ? 110 : 130 }}
          onChange={(val) => updateMemberRole(record.id, selectedTeam.id, val, 'TEAM')}
          options={[
            { value: 'TEAM_ADMIN', label: 'Team Admin' },
            { value: 'MEMBER', label: 'Member' },
          ]}
        />
      ),
    },
    {
      title: '',
      key: 'action',
      render: (_, record) => (
        <Popconfirm
          title="Remove from team?"
          onConfirm={() => removeMember(record.id, selectedTeam.id, 'TEAM')}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // Drawer 2 Columns
  const userDrawerColumns = [
    {
      title: 'Team',
      dataIndex: 'team_name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Role',
      dataIndex: 'team_role',
      key: 'role',
      render: (role, record) => (
        <Select
          value={role}
          style={{ width: isMobile ? 110 : 130 }}
          onChange={(val) => updateMemberRole(selectedUser.id, record.team_id, val, 'USER')}
          options={[
            { value: 'TEAM_ADMIN', label: 'Team Admin' },
            { value: 'MEMBER', label: 'Member' },
          ]}
        />
      ),
    },
    {
      title: '',
      key: 'action',
      render: (_, record) => (
        <Popconfirm
          title="Remove from this team?"
          onConfirm={() => removeMember(selectedUser.id, record.team_id, 'USER')}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div
      style={{
        padding: isMobile ? '16px 12px' : '24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        wrap="wrap"
        gap="small"
        style={{ marginBottom: '24px' }}
      >
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          Team Management
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsCreateModalOpen(true)}
          size={isMobile ? 'middle' : 'middle'}
        >
          {isMobile ? 'New Team' : 'Create New Team'}
        </Button>
      </Flex>

      <Card
        style={{
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
        styles={{ body: { padding: isMobile ? '0 0 12px' : undefined } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size={isMobile ? 'small' : 'middle'}
          style={{ overflowX: 'auto' }}
          items={[
            {
              key: '1',
              label: (
                <span>
                  <TeamOutlined /> {isMobile ? 'Teams' : 'Team Directory'}
                </span>
              ),
              children: (
                <Table
                  columns={teamColumns}
                  dataSource={teams}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  size={isMobile ? 'small' : 'middle'}
                />
              ),
            },
            {
              key: '2',
              label: (
                <span>
                  <UserOutlined /> {isMobile ? 'Assigned' : 'Assigned Users'}
                </span>
              ),
              children: (
                <Table
                  columns={assignedUserColumns}
                  dataSource={assignedUsers}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 'max-content' }}
                  size={isMobile ? 'small' : 'middle'}
                  pagination={{
                    current: assignedPage,
                    pageSize: assignedPageSize,
                    total: assignedTotal,
                    showSizeChanger: true,
                  }}
                  onChange={(pagination) => {
                    setAssignedPage(pagination.current);
                    setAssignedPageSize(pagination.pageSize);
                    fetchAssignedUsers(pagination.current, pagination.pageSize);
                  }}
                />
              ),
            },
            {
              key: '3',
              label: (
                <span>
                  <UserAddOutlined />{' '}
                  {isMobile ? 'Queue' : 'Unassigned Queue'}
                  {unassignedTotal > 0 && (
                    <Badge
                      count={unassignedTotal}
                      style={{ backgroundColor: '#fa8c16', marginLeft: 8 }}
                    />
                  )}
                </span>
              ),
              children: (
                <Table
                  columns={unassignedColumns}
                  dataSource={unassignedUsers}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 'max-content' }}
                  size={isMobile ? 'small' : 'middle'}
                  pagination={{
                    current: unassignedPage,
                    pageSize: unassignedPageSize,
                    total: unassignedTotal,
                    showSizeChanger: true,
                  }}
                  onChange={(pagination) => {
                    setUnassignedPage(pagination.current);
                    setUnassignedPageSize(pagination.pageSize);
                    fetchUnassignedUsers(pagination.current, pagination.pageSize);
                  }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Create New Team"
        open={isCreateModalOpen}
        onOk={handleCreateTeam}
        onCancel={() => setIsCreateModalOpen(false)}
        okText="Create"
        width={isMobile ? '92vw' : 520}
      >
        <Input
          placeholder="e.g. Engineering, Marketing"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          size="large"
        />
      </Modal>

      {/* DRAWER 1: Manage Team Members */}
      <Drawer
        title={selectedTeam ? `Manage Members: ${selectedTeam.name}` : 'Manage Team'}
        placement="right"
        width={drawerWidth}
        onClose={() => setIsTeamDrawerOpen(false)}
        open={isTeamDrawerOpen}
        styles={{ body: { padding: isMobile ? '16px 12px' : '24px' } }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
          Assigning a user as a "Team Admin" grants them access to manage this team.
        </Text>
        <Table
          columns={teamDrawerColumns}
          dataSource={teamMembers}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </Drawer>

      {/* DRAWER 2: Manage User Teams */}
      <Drawer
        title={selectedUser ? `Manage Teams: ${selectedUser.full_name}` : 'Manage User'}
        placement="right"
        width={drawerWidth}
        onClose={() => setIsUserDrawerOpen(false)}
        open={isUserDrawerOpen}
        styles={{ body: { padding: isMobile ? '16px 12px' : '24px' } }}
      >
        <Flex
          gap="small"
          align={isMobile ? 'stretch' : 'center'}
          vertical={isMobile}
          style={{ marginBottom: '24px' }}
        >
          <Select
            placeholder="Add to another team..."
            style={{ flex: 1 }}
            value={teamToAssign}
            onChange={setTeamToAssign}
            options={teams
              .filter((t) => !userTeams.some((ut) => ut.team_id === t.id))
              .map((t) => ({ label: t.name, value: t.id }))}
          />
          <Button
            type="primary"
            disabled={!teamToAssign}
            onClick={handleAssignToAdditionalTeam}
            block={isMobile}
          >
            Add to Team
          </Button>
        </Flex>
        <Divider />
        <Text strong style={{ display: 'block', marginBottom: '16px' }}>
          Current Memberships
        </Text>
        <Table
          columns={userDrawerColumns}
          dataSource={userTeams}
          rowKey="team_id"
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </Drawer>
    </div>
  );
}