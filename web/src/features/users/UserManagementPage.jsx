import React, { useState, useEffect } from 'react';
import { Table, Input, Select, Space, Typography, Tag, Avatar, Dropdown, Flex, message } from 'antd';
import { UserOutlined, SearchOutlined, MoreOutlined, EditOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../utils/colorMaps';
import { ConfigProvider } from 'antd';

const { Title, Text } = Typography;

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [totalUsers, setTotalUsers] = useState(0); // <-- NEW
  const [currentPage, setCurrentPage] = useState(1); // <-- NEW
  const [pageSize, setPageSize] = useState(10); // <-- NEW

  useEffect(() => {
   // Add a slight debounce to the search so we don't spam the backend on every keystroke
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchText]);

const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/users', {
        params: {
          page: currentPage,
          pageSize: pageSize,
          search: searchText
        }
      });
      // Update state with the new paginated wrapper
      setUsers(response.data.users);
      setTotalUsers(response.data.total_count);
    } catch (error) {
      message.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  // Action Menu for the 3 dots
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

  // Frontend Filtering Logic
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name.toLowerCase().includes(searchText.toLowerCase()) || 
      user.email_id.toLowerCase().includes(searchText.toLowerCase());
    
    const matchesRole = roleFilter === 'ALL' || user.roles.includes(roleFilter);
    const matchesStatus = statusFilter === 'ALL' || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={3}>User Management</Title>

      {/* Filters & Search Bar */}
     <Flex gap="middle" style={{ marginBottom: '24px' }}>
        
        {/* Wrap ONLY the Input in a ConfigProvider to force the orange hover/focus states */}
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

      {/* Custom Styled Table Wrapper: 
        Sharp edges (borderRadius: 0), thin orange border (#fa8c16 is Ant's standard orange) 
      */}
      <div style={{ 
        // border: '1px solid #fa8c16', 
        // borderRadius: '0', 
        overflow: 'hidden' // Keeps the table header from clipping the sharp corners
      }}>
        <Table 
          columns={columns} 
          dataSource={users} // Notice we aren't using filteredUsers anymore, backend does the work!
          rowKey="id" 
          loading={loading}
          onChange={handleTableChange} // Hooks into user clicks
          pagination={{ 
            current: currentPage,
            pageSize: pageSize,
            total: totalUsers, // Tells Ant Design how many pages to draw
            showSizeChanger: true 
          }}
          style={{ borderRadius: 0 }}
        />
      </div>
    </div>
  );
}