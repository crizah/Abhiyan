import React, { useState, useEffect } from 'react';
import { Table, Input, Select, Space, Typography, Tag, Avatar, Dropdown, Flex, message, ConfigProvider } from 'antd';
import { UserOutlined, SearchOutlined, MoreOutlined, EditOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../utils/colorMaps';

const { Title, Text } = Typography;

export default function TeamEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [searchText, setSearchText] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Dynamic Team Options
  const [teamOptions, setTeamOptions] = useState([{ value: 'ALL', label: 'All My Teams' }]);

  useEffect(() => {
    fetchTeamOptions();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchText, teamFilter, roleFilter, statusFilter]);

  const fetchTeamOptions = async () => {
    try {
      const response = await apiClient.get('/admin/teams/options');
      const dynamicOptions = response.data.map(name => ({ value: name, label: name }));
      setTeamOptions([{ value: 'ALL', label: 'All My Teams' }, ...dynamicOptions]);
    } catch (error) {
      console.error("Failed to load team options");
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/employees', {
        params: {
          page: currentPage,
          pageSize: pageSize,
          search: searchText,
          team: teamFilter,
          role: roleFilter,
          status: statusFilter
        }
      });
      setEmployees(response.data.employees);
      setTotalUsers(response.data.total_count);
    } catch (error) {
      message.error("Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const getActionMenu = (record) => (
    <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '4px' }}>
      <div 
        onClick={() => message.info(`Edit clicked for ${record.full_name}`)}
        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <EditOutlined style={{ color: '#fa8c16' }} />
        <Text>Manage Access</Text>
      </div>
    </div>
  );

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
      title: 'Team Role',
      dataIndex: 'team_role',
      key: 'team_role',
      render: (role) => (
        <Tag color={ROLE_COLORS[role] || 'default'}>
          {formatRole(role)}
        </Tag>
      ),
    },
    {
      title: 'Team',
      dataIndex: 'team_name',
      key: 'team_name',
      render: (team) => <Text strong>{team}</Text>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={STATUS_COLORS[status] || 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => (
        <Dropdown dropdownRender={() => getActionMenu(record)} trigger={['click']} placement="bottomRight">
          <MoreOutlined style={{ fontSize: '20px', cursor: 'pointer' }} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={3}>Employees</Title>

      <Flex gap="middle" style={{ marginBottom: '24px' }}>
        <ConfigProvider theme={{ components: { Input: { activeBorderColor: '#fa8c16', hoverBorderColor: '#fa8c16' } } }}>
          <Input 
            placeholder="Search by name or email..." 
            prefix={<SearchOutlined />} 
            style={{ width: '300px' }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </ConfigProvider>
        
        <Select 
          value={teamFilter} 
          style={{ width: 180 }} 
          onChange={setTeamFilter}
          options={teamOptions}
        />

        <Select 
          value={roleFilter} 
          style={{ width: 150 }} 
          onChange={setRoleFilter}
          options={[
            { value: 'ALL', label: 'All Roles' },
            { value: 'TEAM_ADMIN', label: 'Team Admin' },
            { value: 'MEMBER', label: 'Member' },
          ]}
        />

        <Select 
          value={statusFilter} 
          style={{ width: 150 }} 
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: 'All Statuses' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INVITED', label: 'Invited' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
      </Flex>

      <div style={{ overflow: 'hidden' }}>
        <Table 
          columns={columns} 
          dataSource={employees} 
          rowKey={(record) => `${record.id}-${record.team_name}`} 
          loading={loading}
          onChange={handleTableChange}
          pagination={{ 
            current: currentPage,
            pageSize: pageSize,
            total: totalUsers,
            showSizeChanger: true 
          }}
          style={{ borderRadius: 0 }}
        />
      </div>
    </div>
  );
}