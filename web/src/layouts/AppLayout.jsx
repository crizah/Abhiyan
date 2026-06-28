import React, { useState, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Flex, message, theme, Typography, Badge, Tag, List, Button, Tooltip } from 'antd';

import { 
  DashboardOutlined, TeamOutlined, BellOutlined, LogoutOutlined,
  UserSwitchOutlined, UserOutlined, SafetyOutlined, SettingOutlined, 
  UserAddOutlined, CheckOutlined, ApartmentOutlined, CheckSquareOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../config/axios';
import { ROLE_COLORS } from '../utils/colorMaps';

import { CSidebar, CSidebarBrand, CSidebarHeader, CSidebarNav, CNavItem } from '@coreui/react';
import '@coreui/coreui/dist/css/coreui.min.css';
import AttendanceFaceRegistration from '../components/AttendanceFaceRegistration';

const { Header, Content } = Layout;
const { Text } = Typography;

// Pure math relative time formatter
const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return `${Math.max(seconds, 1)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const StandardMenuItem = ({ label, icon, onClick, token }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 16px', cursor: 'pointer',
        color: isHovered ? token.colorPrimary : token.colorText,
        transition: 'color 0.2s ease-in-out', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent'
      }}
    >
      {icon && <span style={{ color: isHovered ? token.colorPrimary : token.colorTextSecondary, display: 'flex' }}>{icon}</span>}
      {label}
    </div>
  );
};

const GlobalHeader = ({ user, token, navigate }) => {
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, 60000);
    
    // Listen for the custom real-time event from the task updates
    const handleForceRefresh = () => fetchNotifications();
    window.addEventListener('refresh-notifications', handleForceRefresh);
    
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('refresh-notifications', handleForceRefresh);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/notifications');
      setNotifications(res.data || []);
    } catch (e) {
      console.error("Failed to load notifications", e);
    }
  };

  const markAllRead = async () => {
    try {
      await apiClient.put('/notifications/read');
      setNotifications(notifications.map(n => n.is_system ? n : { ...n, is_read: true }));
    } catch (e) {
      message.error("Failed to mark all as read");
    }
  };

  const markOneRead = async (e, id) => {
    e.stopPropagation(); 
    try {
      await apiClient.put(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      message.error("Failed to mark read");
    }
  };

  const clearAllNotifications = async () => {
    try {
      await apiClient.delete('/notifications/clear');
      // Keep real-time system alerts, but clear all DB notifications from the UI
      setNotifications(prev => prev.filter(n => n.is_system));
      message.success("Notifications cleared");
    } catch (err) {
      message.error("Failed to clear notifications");
    }
  };

  const getNotificationStyle = (item) => {
    if (item.is_system) return { bg: '#fffbe6', border: '#fa8c16' }; 
    if (item.is_read) return { bg: 'transparent', border: 'transparent' };
    
    switch(item.type) {
      case 'SUCCESS': return { bg: '#f6ffed', border: '#52c41a' }; 
      case 'WARNING': return { bg: '#fff2f0', border: '#f5222d' }; 
      default: return { bg: '#e6f7ff', border: '#1890ff' }; 
    }
  };

  const notificationDropdown = (
    <div style={{ width: '350px', backgroundColor: token.colorBgElevated, borderRadius: token.borderRadiusLG, boxShadow: token.boxShadowSecondary, overflow: 'hidden' }}>
      
      {/* Compact Header */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
        <Text strong style={{ fontSize: '13px' }}>Notifications</Text>
        <Flex gap="middle" align="center">
          {unreadCount > 0 && (
            <Button type="link" size="small" onClick={markAllRead} style={{ padding: 0, fontSize: '12px' }}>
              Mark all read
            </Button>
          )}
          {notifications.some(n => !n.is_system) && (
            <Button type="link" danger size="small" onClick={clearAllNotifications} style={{ padding: 0, fontSize: '12px' }}>
              Clear
            </Button>
          )}
        </Flex>
      </div>
      
      {/* Scrollable Body */}
      <div style={{ maxHeight: '350px', overflowY: 'auto', overflowX: 'hidden' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: '24px', color: token.colorTextQuaternary, marginBottom: '8px' }} />
            <br />
            <Text type="secondary" style={{ fontSize: '13px' }}>You're all caught up!</Text>
          </div>
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={notifications}
            renderItem={item => {
              const style = getNotificationStyle(item);
              return (
                <List.Item 
                  style={{ 
                    padding: '12px 16px', 
                    backgroundColor: style.bg,
                    borderLeft: `4px solid ${style.border}`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    transition: 'background-color 0.2s',
                  }}
                >
                  <Flex gap="middle" align="flex-start" style={{ width: '100%' }}>
                    
                    {/* Text Content */}
                    <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                      <Flex justify="space-between" align="flex-start">
                        <Flex align="center" gap="small" wrap="wrap">
                          <Text strong style={{ fontSize: '13px', color: token.colorText, lineHeight: '1.2' }}>
                            {item.title}
                          </Text>
                          {item.is_system && <Tag color="orange" style={{ margin: 0, fontSize: '10px', lineHeight: '14px', padding: '0 4px' }}>System</Tag>}
                        </Flex>
                       <Text type="secondary" style={{ fontSize: '11px', color: 'green', whiteSpace: 'nowrap', marginLeft: '8px' }}>
  {item.is_system ? 'Live Queue' : formatTimeAgo(item.created_at)}
</Text>
                      </Flex>
                      <Text style={{ fontSize: '12px', color: token.colorTextSecondary, marginTop: '4px', lineHeight: '1.4' }}>
                        {item.message}
                      </Text>
                    </Flex>

                    {/* Fixed Action Button */}
                    {!item.is_read && !item.is_system && (
                      <Tooltip title="Mark as read">
                        <Button 
                          type="text" 
                          shape="circle" 
                          icon={<CheckOutlined />} 
                          size="small" 
                          onClick={(e) => markOneRead(e, item.id)}
                          style={{ color: token.colorPrimary, backgroundColor: 'rgba(24, 144, 255, 0.05)', flexShrink: 0, marginTop: '2px' }}
                        />
                      </Tooltip>
                    )}
                    
                  </Flex>
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  );

  const customHeaderDropdown = (
    <div style={{ backgroundColor: token.colorBgElevated, borderRadius: token.borderRadiusLG, boxShadow: token.boxShadowSecondary, padding: '8px 0', minWidth: '160px' }}>
      <StandardMenuItem label="User Profile" icon={<UserOutlined />} onClick={() => navigate('/profile')} token={token} />
      <StandardMenuItem label="Settings" icon={<SettingOutlined />} onClick={(e) => e.preventDefault()} token={token} />
    </div>
  );

  return (
    <Header style={{ height: '64px', background: token.colorBgContainer, padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}`, position: 'sticky', top: 0, zIndex: 10 }}>
      <Text strong style={{ fontSize: '16px', color: token.colorTextHeading }}>{user?.org_name || 'Organization Workspace'}</Text>

      <Flex align="center" gap="large">
        
        <Dropdown dropdownRender={() => notificationDropdown} placement="bottomRight" trigger={['click']}>
          <Badge count={unreadCount} overflowCount={99} size="small" style={{ backgroundColor: '#fa8c16' }}>
            <BellOutlined style={{ fontSize: '20px', cursor: 'pointer', color: token.colorTextSecondary }} />
          </Badge>
        </Dropdown>

        <Dropdown dropdownRender={() => customHeaderDropdown} placement="bottomRight" trigger={['click']}>
          <Flex align="center" gap="small" style={{ cursor: 'pointer' }}>
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />
            <Flex vertical align="flex-start" justify="center">
              <Text strong style={{ lineHeight: '1.2' }}>{user?.email}</Text>
              <Tag color={ROLE_COLORS[user?.role] || 'blue'} bordered={false} style={{ margin: 0, marginTop: '2px', fontSize: '10px' }}>
                {(user?.role || '').replace('_', ' ')}
              </Tag>
            </Flex>
          </Flex>
        </Dropdown>

      </Flex>
    </Header>
  );
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken(); 

  const activeRole = (user?.role || '').toUpperCase();

  const handleRoleSwitch = async (targetRole) => {
    try {
      await apiClient.post('/auth/switch-role', { target_role: targetRole });
      message.success(`Switched context to ${targetRole}`);
      window.location.href = '/dashboard';
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to switch roles");
    }
  };

  const customRoleDropdown = (
    <div style={{ backgroundColor: token.colorBgElevated, borderRadius: token.borderRadiusLG, boxShadow: token.boxShadowSecondary, padding: '8px 0', minWidth: '140px' }}>
      <StandardMenuItem label="Super Admin" onClick={() => handleRoleSwitch('SUPER_ADMIN')} token={token} />
      <StandardMenuItem label="Admin" onClick={() => handleRoleSwitch('ADMIN')} token={token} />
      <StandardMenuItem label="Employee" onClick={() => handleRoleSwitch('EMPLOYEE')} token={token} />
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: token.colorBgLayout }}>
      <CSidebar className="border-end" unfoldable style={{ background: token.colorBgContainer, position: 'fixed', zIndex: 1000, height: '100vh' }}>
        <CSidebarHeader className="border-bottom" style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <CSidebarBrand><Avatar shape="square" size={40} style={{ backgroundColor: token.colorPrimary }} icon={<SafetyOutlined />} /></CSidebarBrand>
        </CSidebarHeader>

        <CSidebarNav>
          <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }} active={location.pathname === '/dashboard'}><DashboardOutlined className="nav-icon" /> Dashboard</CNavItem>
          
          {/* SUPER ADMIN SPECIFIC ITEMS */}
          {activeRole === 'SUPER_ADMIN' && (
            <>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/users'); }} active={location.pathname === '/users'}><TeamOutlined className="nav-icon" /> Users</CNavItem>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/onboarding'); }} active={location.pathname === '/onboarding'}><UserAddOutlined className="nav-icon" /> User Onboarding</CNavItem>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/teams'); }} active={location.pathname === '/teams'}>
                <ApartmentOutlined className="nav-icon" /> Teams
              </CNavItem>
            </>
          )}

          {/* ADMIN SPECIFIC ITEMS */}
          {activeRole === 'ADMIN' && (
            <>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/employees'); }} active={location.pathname === '/employees'}><TeamOutlined className="nav-icon" /> Employees</CNavItem>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/tasks'); }} active={location.pathname === '/tasks'}><CheckSquareOutlined className="nav-icon" /> Tasks</CNavItem>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/admin-teams'); }} active={location.pathname === '/admin-teams'}><ApartmentOutlined className="nav-icon" /> Teams
              </CNavItem>
            </>
          )}
          
          {/* EMPLOYEE SPECIFIC ITEMS */}
          {activeRole === 'EMPLOYEE' && (
            <>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/employee-tasks'); }} active={location.pathname === '/employee-tasks'}><CheckSquareOutlined className="nav-icon" /> Tasks</CNavItem>
            </>
          )}

          {/* COMMON BOTTOM ITEMS */}
          <Dropdown dropdownRender={() => customRoleDropdown} placement="topLeft" trigger={['click']}>
            <CNavItem className="mt-auto" href="#" style={{ cursor: 'pointer' }}><UserSwitchOutlined className="nav-icon" /> Switch Roles</CNavItem>
          </Dropdown>
          <CNavItem href="#" onClick={logout} style={{ cursor: 'pointer', color: token.colorError }}><LogoutOutlined className="nav-icon" /> Sign Out</CNavItem>
        </CSidebarNav>
      </CSidebar>

      <Layout style={{ marginLeft: '64px', transition: 'all 0.3s ease-in-out', flexGrow: 1, minHeight: '100vh' }}>
        <GlobalHeader user={user} token={token} navigate={navigate} />
        <Content style={{ margin: '24px', background: token.colorBgContainer, padding: 24, borderRadius: '8px' }}>
          <AttendanceFaceRegistration />
          <Outlet />
        </Content>
      </Layout>
    </div>
  );
}