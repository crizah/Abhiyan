import React, { useState, useEffect } from 'react';
import { Table, Input, Select, Typography, Tag, Avatar, Dropdown, Flex, message, ConfigProvider } from 'antd';
import { UserOutlined, SearchOutlined, MoreOutlined, EditOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../utils/colorMaps';

const { Title, Text } = Typography;

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchText, roleFilter, statusFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/users', {
        params: {
          page: currentPage,
          pageSize: pageSize,
          search: searchText,
          role: roleFilter,
          status: statusFilter
        }
      });
      setUsers(response.data.users);
      setTotalUsers(response.data.total_count);
    } catch (error) {
      message.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
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
        <Text>Edit User</Text>
      </div>
    </div>
  );

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

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
          {roles.map(role => (
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
      <Title level={3}>Users</Title>

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
          defaultValue="ALL" 
          style={{ width: 150 }} 
          onChange={setRoleFilter}
          options={[
            { value: 'ALL', label: 'All Roles' },
            { value: 'SUPER_ADMIN', label: 'Super Admin' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'EMPLOYEE', label: 'Employee' },
          ]}
        />

        <Select 
          defaultValue="ALL" 
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
          dataSource={users} 
          rowKey="id" 
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