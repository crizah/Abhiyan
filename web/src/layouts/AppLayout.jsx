import React, { useState, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Flex, message, theme, Typography, Badge, Tag, List, Button } from 'antd'; // Added List, Button
import { 
  DashboardOutlined, TeamOutlined, BellOutlined, LogoutOutlined,
  UserSwitchOutlined, UserOutlined, SafetyOutlined, SettingOutlined, UserAddOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../config/axios';
import { ROLE_COLORS } from '../utils/colorMaps';

import { CSidebar, CSidebarBrand, CSidebarHeader, CSidebarNav, CNavItem } from '@coreui/react';
import '@coreui/coreui/dist/css/coreui.min.css'; 

const { Header, Content } = Layout;
const { Text } = Typography;

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
  // --- NOTIFICATION STATE ---
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter(n => !n.is_read).length;

useEffect(() => {
    // 1. Fetch immediately when the app first loads
    fetchNotifications();

    // 2. Set up the polling interval (Checks every 60 seconds)
    const intervalId = setInterval(() => {
      fetchNotifications();
    }, 60000); // 60000 milliseconds = 1 minute

    // 3. CRITICAL: Cleanup function to stop the timer if the component unmounts
    return () => clearInterval(intervalId);
  }, []);

  const fetchNotifications = async () => {
    try {

      const res = await apiClient.get('/notifications');
      setNotifications(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const markAllRead = async () => {
    // await apiClient.post('/notifications/read');
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
  };

  const notificationDropdown = (
    <div style={{ width: '320px', backgroundColor: token.colorBgElevated, borderRadius: token.borderRadiusLG, boxShadow: token.boxShadowSecondary, overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between' }}>
        <Text strong>Notifications</Text>
        <Text style={{ fontSize: '12px', color: token.colorPrimary, cursor: 'pointer' }} onClick={markAllRead}>Mark all read</Text>
      </div>
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center' }}><Text type="secondary">No new notifications</Text></div>
        ) : (
          <List
            dataSource={notifications}
            renderItem={item => (
              <List.Item style={{ padding: '12px 16px', backgroundColor: item.is_read ? 'transparent' : '#fffbe6', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <List.Item.Meta
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text strong style={{ fontSize: '13px' }}>{item.title}</Text>
                      {item.is_system && <Tag color="orange" style={{ margin: 0 }}>System</Tag>}
                    </div>
                  }
                  description={<Text style={{ fontSize: '12px' }}>{item.message}</Text>}
                />
              </List.Item>
            )}
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
        
        {/* The Notification Bell */}
        <Dropdown dropdownRender={() => notificationDropdown} placement="bottomRight" trigger={['click']}>
          <Badge dot={unreadCount > 0} offset={[-2, 4]}>
            <BellOutlined style={{ fontSize: '20px', cursor: 'pointer', color: token.colorTextSecondary }} />
          </Badge>
        </Dropdown>

        {/* The Profile Dropdown */}
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
          {activeRole === 'SUPER_ADMIN' && (
            <>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/users'); }} active={location.pathname === '/users'}><TeamOutlined className="nav-icon" /> Users</CNavItem>
              <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/onboarding'); }} active={location.pathname === '/onboarding'}><UserAddOutlined className="nav-icon" /> User Onboarding</CNavItem>
            </>
          )}
          {activeRole === 'ADMIN' && (
            <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/employees'); }} active={location.pathname === '/employees'}><TeamOutlined className="nav-icon" /> Employees</CNavItem>
          )}
          <Dropdown dropdownRender={() => customRoleDropdown} placement="topLeft" trigger={['click']}>
            <CNavItem className="mt-auto" href="#" style={{ cursor: 'pointer' }}><UserSwitchOutlined className="nav-icon" /> Switch Roles</CNavItem>
          </Dropdown>
          <CNavItem href="#" onClick={logout} style={{ cursor: 'pointer', color: token.colorError }}><LogoutOutlined className="nav-icon" /> Sign Out</CNavItem>
        </CSidebarNav>
      </CSidebar>

      <Layout style={{ marginLeft: '64px', transition: 'all 0.3s ease-in-out', flexGrow: 1, minHeight: '100vh' }}>
        <GlobalHeader user={user} token={token} navigate={navigate} />
        <Content style={{ margin: '24px', background: token.colorBgContainer, padding: 24, borderRadius: '8px' }}>
          <Outlet /> 
        </Content>
      </Layout>
    </div>
  );
}