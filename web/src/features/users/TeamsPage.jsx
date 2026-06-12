import React, { useState, useEffect } from 'react';
import { Typography, Tabs, Card, Button, Table, Flex, Tag, Drawer, Select, message, Modal, Input, Badge, Popconfirm } from 'antd';
import { TeamOutlined, PlusOutlined, UserAddOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';

const { Title, Text } = Typography;

export default function TeamsPage() {
  const [activeTab, setActiveTab] = useState('1');
  const [teams, setTeams] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // New state to track which team is selected in the dropdown BEFORE assigning
  const [pendingAssignments, setPendingAssignments] = useState({});

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  // Fetch both independently so the dropdown ALWAYS has the latest teams
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [teamsRes, unassignedRes] = await Promise.all([
        apiClient.get('/admin/teams'),
        apiClient.get('/admin/users/unassigned')
      ]);
      setTeams(teamsRes.data || []);
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
      fetchAllData(); // Instantly refreshes the dropdown in Tab 2
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to create team");
    }
  };

  // --- DRAWER MANAGEMENT (Manage Team Members) ---
  const openTeamDrawer = async (team) => {
    setSelectedTeam(team);
    setIsDrawerOpen(true);
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

  const updateMemberRole = async (userId, newRole) => {
    try {
      await apiClient.post(`/admin/teams/${selectedTeam.id}/members`, { user_id: userId, team_role: newRole });
      message.success("Role updated");
      fetchTeamMembers(selectedTeam.id);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to update role");
    }
  };

  const removeMember = async (userId) => {
    try {
      await apiClient.delete(`/admin/teams/${selectedTeam.id}/members/${userId}`);
      message.success("Member removed");
      fetchTeamMembers(selectedTeam.id);
      fetchAllData(); 
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to remove member");
    }
  };

  // --- QUEUE ASSIGNMENT ---
  const handleDropdownChange = (userId, teamId) => {
    setPendingAssignments(prev => ({ ...prev, [userId]: teamId }));
  };

  const executeAssignment = async (userId) => {
    const teamId = pendingAssignments[userId];
    if (!teamId) return;

    try {
      await apiClient.post(`/admin/teams/${teamId}/members`, { user_id: userId, team_role: 'MEMBER' });
      message.success("User assigned to team!");
      
      // Clear the local state for this user and refresh the tables
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

  const teamColumns = [
    { title: 'Team Name', dataIndex: 'name', key: 'name', render: text => <Text strong>{text}</Text> },
    { title: 'Total Members', dataIndex: 'member_count', key: 'count' },
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
          Manage Members
        </Button>
      )
    }
  ];

  const unassignedColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name', render: text => <Text strong>{text}</Text> },
    { title: 'Email', dataIndex: 'email_id', key: 'email' },
    { 
      title: 'Assign To', 
      key: 'assign', 
      render: (_, record) => (
        <Flex gap="small" align="center">
          <Select 
            placeholder="Select Team" 
            style={{ width: 160 }}
            value={pendingAssignments[record.id]}
            onChange={(val) => handleDropdownChange(record.id, val)}
            options={teams.map(t => ({ label: t.name, value: t.id }))} 
          />
          <Button 
            type="primary" 
            size="small" 
            disabled={!pendingAssignments[record.id]}
            onClick={() => executeAssignment(record.id)}
          >
            Assign
          </Button>
        </Flex>
      )
    }
  ];

  const drawerColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name' },
    { 
      title: 'Role', 
      dataIndex: 'team_role', 
      key: 'role',
      render: (role, record) => (
        <Select 
          value={role} 
          style={{ width: 130 }} 
          onChange={(val) => updateMemberRole(record.id, val)}
          options={[
            { value: 'TEAM_ADMIN', label: 'Team Admin' },
            { value: 'MEMBER', label: 'Member' },
          ]}
        />
      )
    },
    { 
      title: '', 
      key: 'action',
      render: (_, record) => (
        <Popconfirm title="Remove from team?" onConfirm={() => removeMember(record.id)}>
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
              label: <span><UserAddOutlined /> Unassigned Queue {unassignedUsers.length > 0 && <Badge count={unassignedUsers.length} style={{ backgroundColor: '#fa8c16', marginLeft: 8 }}/>}</span>,
              children: <Table columns={unassignedColumns} dataSource={unassignedUsers} rowKey="id" loading={loading} pagination={false} />
            }
          ]}
        />
      </Card>

      <Modal title="Create New Team" open={isCreateModalOpen} onOk={handleCreateTeam} onCancel={() => setIsCreateModalOpen(false)} okText="Create">
        <Input placeholder="e.g. Engineering, Marketing" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} size="large" />
      </Modal>

      <Drawer
        title={selectedTeam ? `Manage: ${selectedTeam.name}` : 'Manage Team'}
        placement="right"
        width={500}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
          Assigning a user as a "Team Admin" automatically grants them access to the Admin Dashboard for this specific team.
        </Text>
        <Table columns={drawerColumns} dataSource={teamMembers} rowKey="id" pagination={false} size="small" />
      </Drawer>
    </div>
  );
}