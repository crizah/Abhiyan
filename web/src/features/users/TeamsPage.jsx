import React, { useState, useEffect } from 'react';
import { Typography, Tabs, Card, Button, Table, Flex, Tag, Drawer, Select, message, Modal, Input, Badge, Popconfirm, Divider } from 'antd';
import { TeamOutlined, PlusOutlined, UserAddOutlined, DeleteOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';

const { Title, Text } = Typography;

export default function TeamsPage() {
  const [activeTab, setActiveTab] = useState('1');
  const [teams, setTeams] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [teamsRes, assignedRes, unassignedRes] = await Promise.all([
        apiClient.get('/admin/teams'),
        apiClient.get('/admin/users/assigned'),
        apiClient.get('/admin/users/unassigned')
      ]);
      setTeams(teamsRes.data || []);
      setAssignedUsers(assignedRes.data || []);
      setUnassignedUsers(unassignedRes.data || []);
    } catch (err) {
      message.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  // --- TEAM CREATION ---
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      await apiClient.post('/admin/teams', { name: newTeamName });
      message.success("Team created successfully");
      setIsCreateModalOpen(false);
      setNewTeamName('');
      fetchAllData();
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to create team");
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
      message.error("Failed to load team members");
    }
  };

  const updateMemberRole = async (userId, teamId, newRole, refreshType) => {
    try {
      await apiClient.post(`/admin/teams/${teamId}/members`, { user_id: userId, team_role: newRole });
      message.success("Role updated");
      if (refreshType === 'TEAM') fetchTeamMembers(teamId);
      if (refreshType === 'USER') fetchUserTeams(userId);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to update role");
    }
  };

  const removeMember = async (userId, teamId, refreshType) => {
    try {
      await apiClient.delete(`/admin/teams/${teamId}/members/${userId}`);
      message.success("Removed from team");
      if (refreshType === 'TEAM') fetchTeamMembers(teamId);
      if (refreshType === 'USER') fetchUserTeams(userId);
      fetchAllData(); 
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to remove member");
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
      message.error("Failed to load user teams");
    }
  };

  const handleAssignToAdditionalTeam = async () => {
    if (!teamToAssign) return;
    try {
      await apiClient.post(`/admin/teams/${teamToAssign}/members`, { user_id: selectedUser.id, team_role: 'MEMBER' });
      message.success("Added to team!");
      setTeamToAssign(null);
      fetchUserTeams(selectedUser.id);
      fetchAllData();
    } catch (err) {
      message.error("Failed to assign team.");
    }
  };

  // --- TAB 3: UNASSIGNED QUEUE ---
  const handleQueueDropdownChange = (userId, teamId) => {
    setPendingAssignments(prev => ({ ...prev, [userId]: teamId }));
  };

  const executeQueueAssignment = async (userId) => {
    const teamId = pendingAssignments[userId];
    if (!teamId) return;

    try {
      await apiClient.post(`/admin/teams/${teamId}/members`, { user_id: userId, team_role: 'MEMBER' });
      message.success("User assigned to team!");
      setPendingAssignments(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      fetchAllData(); 
    } catch (err) {
      message.error("Failed to assign user.");
    }
  };

  // --- TABLE COLUMNS ---
  const teamColumns = [
    { title: 'Team Name', dataIndex: 'name', key: 'name', render: text => <Text strong>{text}</Text> },
    { title: 'Total Members', dataIndex: 'member_count', key: 'count' },
    { 
      title: 'Action', key: 'action', 
      render: (_, record) => (
        <Button type="default" size="small" icon={<SettingOutlined />} onClick={() => openTeamDrawer(record)}>
          Manage Members
        </Button>
      )
    }
  ];

  const assignedUserColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name', render: text => <Text strong>{text}</Text> },
    { title: 'Email', dataIndex: 'email_id', key: 'email' },
    { 
      title: 'Action', key: 'action', 
      render: (_, record) => (
        <Button type="default" size="small" icon={<UserOutlined />} onClick={() => openUserDrawer(record)}>
          Manage User
        </Button>
      )
    }
  ];

  const unassignedColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name', render: text => <Text strong>{text}</Text> },
    { title: 'Email', dataIndex: 'email_id', key: 'email' },
    { 
      title: 'Assign To', key: 'assign', 
      render: (_, record) => (
        <Flex gap="small" align="center">
          <Select 
            placeholder="Select Team" 
            style={{ width: 160 }}
            value={pendingAssignments[record.id]}
            onChange={(val) => handleQueueDropdownChange(record.id, val)}
            options={teams.map(t => ({ label: t.name, value: t.id }))} 
          />
          <Button type="primary" size="small" disabled={!pendingAssignments[record.id]} onClick={() => executeQueueAssignment(record.id)}>
            Assign
          </Button>
        </Flex>
      )
    }
  ];

  // Drawer 1 Columns
  const teamDrawerColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name' },
    { 
      title: 'Role', dataIndex: 'team_role', key: 'role',
      render: (role, record) => (
        <Select 
          value={role} style={{ width: 130 }} 
          onChange={(val) => updateMemberRole(record.id, selectedTeam.id, val, 'TEAM')}
          options={[{ value: 'TEAM_ADMIN', label: 'Team Admin' }, { value: 'MEMBER', label: 'Member' }]}
        />
      )
    },
    { 
      title: '', key: 'action',
      render: (_, record) => (
        <Popconfirm title="Remove from team?" onConfirm={() => removeMember(record.id, selectedTeam.id, 'TEAM')}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ];

  // Drawer 2 Columns
  const userDrawerColumns = [
    { title: 'Team', dataIndex: 'team_name', key: 'name', render: text => <Text strong>{text}</Text> },
    { 
      title: 'Role', dataIndex: 'team_role', key: 'role',
      render: (role, record) => (
        <Select 
          value={role} style={{ width: 130 }} 
          onChange={(val) => updateMemberRole(selectedUser.id, record.team_id, val, 'USER')}
          options={[{ value: 'TEAM_ADMIN', label: 'Team Admin' }, { value: 'MEMBER', label: 'Member' }]}
        />
      )
    },
    { 
      title: '', key: 'action',
      render: (_, record) => (
        <Popconfirm title="Remove from this team?" onConfirm={() => removeMember(selectedUser.id, record.team_id, 'USER')}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: '24px' }}>
        <Title level={3} style={{ margin: 0 }}>Team Management</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
          Create New Team
        </Button>
      </Flex>

      <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: '1',
              label: <span><TeamOutlined /> Team Directory</span>,
              children: <Table columns={teamColumns} dataSource={teams} rowKey="id" loading={loading} pagination={false} />
            },
            {
              key: '2',
              label: <span><UserOutlined /> Assigned Users</span>,
              children: <Table columns={assignedUserColumns} dataSource={assignedUsers} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
            },
            {
              key: '3',
              label: <span><UserAddOutlined /> Unassigned Queue {unassignedUsers.length > 0 && <Badge count={unassignedUsers.length} style={{ backgroundColor: '#fa8c16', marginLeft: 8 }}/>}</span>,
              children: <Table columns={unassignedColumns} dataSource={unassignedUsers} rowKey="id" loading={loading} pagination={false} />
            }
          ]}
        />
      </Card>

      <Modal title="Create New Team" open={isCreateModalOpen} onOk={handleCreateTeam} onCancel={() => setIsCreateModalOpen(false)} okText="Create">
        <Input placeholder="e.g. Engineering, Marketing" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} size="large" />
      </Modal>

      {/* DRAWER 1: Manage Team Members */}
      <Drawer
        title={selectedTeam ? `Manage Members: ${selectedTeam.name}` : 'Manage Team'}
        placement="right" width={500}
        onClose={() => setIsTeamDrawerOpen(false)} open={isTeamDrawerOpen}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
          Assigning a user as a "Team Admin" grants them access to manage this team.
        </Text>
        <Table columns={teamDrawerColumns} dataSource={teamMembers} rowKey="id" pagination={false} size="small" />
      </Drawer>

      {/* DRAWER 2: Manage User Teams */}
      <Drawer
        title={selectedUser ? `Manage Teams: ${selectedUser.full_name}` : 'Manage User'}
        placement="right" width={500}
        onClose={() => setIsUserDrawerOpen(false)} open={isUserDrawerOpen}
      >
        <Flex gap="small" align="center" style={{ marginBottom: '24px' }}>
          <Select 
            placeholder="Add to another team..." 
            style={{ flex: 1 }}
            value={teamToAssign}
            onChange={setTeamToAssign}
            // Filter out teams the user is already in
            options={teams.filter(t => !userTeams.some(ut => ut.team_id === t.id)).map(t => ({ label: t.name, value: t.id }))} 
          />
          <Button type="primary" disabled={!teamToAssign} onClick={handleAssignToAdditionalTeam}>
            Add to Team
          </Button>
        </Flex>
        <Divider />
        <Text strong style={{ display: 'block', marginBottom: '16px' }}>Current Memberships</Text>
        <Table columns={userDrawerColumns} dataSource={userTeams} rowKey="team_id" pagination={false} size="small" />
      </Drawer>
    </div>
  );
}