import React, { useState, useEffect } from 'react';
import { Typography, Tabs, Card, Button, Table, Flex, Input, Select, Drawer, Tag, Popconfirm, Divider, message } from 'antd';
import { TeamOutlined, DeleteOutlined, SettingOutlined, UserOutlined, SearchOutlined } from '@ant-design/icons';
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
  const [loadingTeams, setLoadingTeams] = useState(true);
  
  // Unified Employees Paginated State
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  
  // Drawer 1: Manage Team Members
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [isTeamDrawerOpen, setIsTeamDrawerOpen] = useState(false);

  // Drawer 2: Manage User Teams
  const [selectedUser, setSelectedUser] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [teamToAssign, setTeamToAssign] = useState(null);

  // Load initial structural data
  useEffect(() => {
    fetchTeams();
  }, []);

  // Fetch employees list when tracking criteria or pages change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, search, selectedTeamFilter, selectedRoleFilter]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      const res = await apiClient.get('/admin/my-teams');
      setTeams(res.data || []);
    } catch (err) {
      message.error("Failed to load managed teams.");
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await apiClient.get('/admin/employees', {
        params: {
          page: currentPage,
          pageSize: pageSize,
          search: search,
          team: selectedTeamFilter,
          role: selectedRoleFilter,
          status: 'ACTIVE' // Always force active users only
        }
      });

      const rawEmployees = res.data?.employees || [];
      
      // OPTIMIZED O(N) DEDUPLICATION: Only execute if global "ALL" filter is active
      if (selectedTeamFilter === 'ALL') {
        const seenIds = new Set();
        const uniqueEmployees = rawEmployees.filter(emp => {
          if (seenIds.has(emp.id)) return false;
          seenIds.add(emp.id);
          return true;
        });
        setAssignedUsers(uniqueEmployees);
      } else {
        // If a specific team filter is picked, show raw rows natively
        setAssignedUsers(rawEmployees);
      }

      setTotalCount(res.data?.total_count || 0);
    } catch (err) {
      message.error("Failed to load member records.");
    } finally {
      setLoadingEmployees(false);
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
      fetchEmployees();
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
      fetchEmployees(); 
      fetchTeams();
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
      fetchEmployees();
      fetchTeams();
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to assign team.");
    }
  };

  // --- TABLE COLUMNS ---
  const teamColumns = [
    { title: 'Team Name', dataIndex: 'name', key: 'name', render: text => <Text strong>{text}</Text> },
    { title: 'Total Members', dataIndex: 'member_count', key: 'count', responsive: ['sm'] },
    { 
      title: 'Action', key: 'action', 
      render: (_, record) => (
        <Button type="default" size="small" icon={<SettingOutlined />} onClick={() => openTeamDrawer(record)}>
          {isMobile ? null : 'Manage Members'}
        </Button>
      )
    }
  ];

  // DYNAMIC COLUMNS ENGINE: Adapts automatically based on the chosen team filter
  const getAssignedUserColumns = () => {
    const columns = [
      { title: 'Name', dataIndex: 'full_name', key: 'name', render: text => <Text strong>{text}</Text> },
      { title: 'Email', dataIndex: 'email_id', key: 'email', responsive: ['sm'] }
    ];

    // Only inject Team Space and Team Role context if looking at a specific team slice
    if (selectedTeamFilter !== 'ALL') {
      columns.push(
        { title: 'Team Name', dataIndex: 'team_name', key: 'teamName', render: text => text ? <Tag color="blue">{text}</Tag> : <Text type="secondary" italic>No Team</Text> },
        { title: 'Team Role', dataIndex: 'team_role', key: 'teamRole', render: text => text === 'TEAM_ADMIN' ? <Tag color="gold">Team Admin</Tag> : text ? <Tag>{text}</Tag> : null }
      );
    }

    columns.push({ 
      title: 'Action', key: 'action', 
      render: (_, record) => (
        <Button type="default" size="small" icon={<UserOutlined />} onClick={() => openUserDrawer(record)}>
          {isMobile ? null : 'Manage User'}
        </Button>
      )
    });

    return columns;
  };

  // Drawer 1 Columns
  const teamDrawerColumns = [
    { title: 'Name', dataIndex: 'full_name', key: 'name' },
    { 
      title: 'Role', dataIndex: 'team_role', key: 'role',
      render: (role, record) => (
        <Select 
          value={role} style={{ width: isMobile ? 110 : 130 }} 
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
          value={role} style={{ width: isMobile ? 110 : 130 }} 
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
    <div style={{ 
      padding: isMobile ? '16px 12px' : '24px', 
      maxWidth: '1200px', 
      margin: '0 auto' 
    }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: '24px' }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>Team Management</Title>
      </Flex>

      <Card 
        style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
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
              label: <span><TeamOutlined /> Team Directory</span>,
              children: (
                <Table 
                  columns={teamColumns} 
                  dataSource={teams} 
                  rowKey="id" 
                  loading={loadingTeams} 
                  pagination={false} 
                  scroll={{ x: 'max-content' }}
                  size={isMobile ? 'small' : 'middle'}
                />
              )
            },
            {
              key: '2',
              label: <span><UserOutlined /> Team Members</span>,
              children: (
                <Flex vertical gap="medium" style={{ padding: isMobile ? '0 12px' : 0 }}>
                  {/* Dynamic Frontend Filtering Grid */}
                  <Flex gap="small" wrap="wrap" style={{ marginBottom: '12px' }}>
                    <Input
                      placeholder="Search member name or email..."
                      prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                      style={{ width: isMobile ? '100%' : 260 }}
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                      allowClear
                    />
                    <Select
                      style={{ width: isMobile ? '100%' : 160 }}
                      value={selectedTeamFilter}
                      onChange={(val) => { setSelectedTeamFilter(val); setCurrentPage(1); }}
                      options={[{ value: 'ALL', label: 'All Teams' }, ...teams.map(t => ({ value: t.name, label: t.name }))]}
                    />
                    <Select
                      style={{ width: isMobile ? '100%' : 160 }}
                      value={selectedRoleFilter}
                      onChange={(val) => { setSelectedRoleFilter(val); setCurrentPage(1); }}
                      options={[
                        { value: 'ALL', label: 'All Roles' },
                        { value: 'TEAM_ADMIN', label: 'Team Admin' },
                        { value: 'MEMBER', label: 'Member' }
                      ]}
                    />
                  </Flex>

                  <Table 
                    columns={getAssignedUserColumns()} 
                    dataSource={assignedUsers} 
                    rowKey={(record) => selectedTeamFilter === 'ALL' ? record.id : `${record.id}-${record.team_name}`} 
                    loading={loadingEmployees} 
                    scroll={{ x: 'max-content' }}
                    size={isMobile ? 'small' : 'middle'}
                    pagination={{
                      current: currentPage,
                      pageSize: pageSize,
                      total: totalCount,
                      showSizeChanger: true,
                      size: isMobile ? 'small' : 'default',
                      onChange: (page, size) => {
                        setCurrentPage(page);
                        setPageSize(size);
                      }
                    }} 
                  />
                </Flex>
              )
            }
          ]}
        />
      </Card>

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
            options={teams.filter(t => !userTeams.some(ut => ut.team_id === t.id)).map(t => ({ label: t.name, value: t.id }))} 
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
        <Text strong style={{ display: 'block', marginBottom: '16px' }}>Current Memberships</Text>
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