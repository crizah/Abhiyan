import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Flex, Tooltip, message, theme, Typography, Badge } from 'antd';
import { 
  DashboardOutlined, 
  TeamOutlined, 
  BellOutlined, 
  LogoutOutlined,
  UserSwitchOutlined,
  UserOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../config/axios';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// --- Custom Components ---

// 1. The SVG Action Icon (For Sidebar)
const ActionIcon = ({ icon: Icon, defaultColor, hoverColor, onClick, tooltip }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const iconMarkup = (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        cursor: 'pointer',
        padding: '16px 0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        color: isHovered ? hoverColor : defaultColor,
        transition: 'color 0.2s ease-in-out',
        width: '100%',
      }}
    >
      <Icon style={{ fontSize: '20px' }} />
    </div>
  );

  return tooltip ? <Tooltip title={tooltip} placement="right">{iconMarkup}</Tooltip> : iconMarkup;
};

// 2. The Custom Role Menu Item (Text color change only, no background fill)
const RoleMenuItem = ({ label, onClick, token }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 16px',
        cursor: 'pointer',
        color: isHovered ? token.colorPrimary : token.colorText,
        transition: 'color 0.2s ease-in-out',
        fontWeight: 500,
        textAlign: 'center',
        background: 'transparent' // Strictly prevents ghost boxes
      }}
    >
      {label}
    </div>
  );
};


export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken(); 

  const activeRole = (user?.role || '').toUpperCase();

  const getMenuItems = () => {
    const items = [
      { key: '/dashboard', icon: <DashboardOutlined style={{ fontSize: '20px' }} />, label: 'Dashboard' }
    ];

    if (activeRole === 'SUPER_ADMIN') {
      items.push({ key: '/users', icon: <TeamOutlined style={{ fontSize: '20px' }} />, label: 'User Management' });
    }

    return items;
  };

  const handleRoleSwitch = async (targetRole) => {
    try {
      // Actually hit the Go backend to mint and set the new JWT cookie
      await apiClient.post('/auth/switch-role', { target_role: targetRole });
      
      message.success(`Switched context to ${targetRole}`);
      
      // Reloading the window forces React to mount again, hit the /me endpoint, 
      // read the brand new cookie, and route you to the correct dashboard!
      window.location.reload(); 
    } catch (err) {
      // Show the actual error from the Go backend if it fails
      const errorMessage = err.response?.data?.error || "Failed to switch roles";
      message.error(errorMessage);
    }
  };

  // Custom Dropdown UI to bypass Ant Design's forced background hovers
  const customRoleDropdown = (
    <div style={{
      backgroundColor: token.colorBgElevated,
      borderRadius: token.borderRadiusLG,
      boxShadow: token.boxShadowSecondary,
      padding: '8px 0',
      minWidth: '140px'
    }}>
      <RoleMenuItem label="Super Admin" onClick={() => handleRoleSwitch('SUPER_ADMIN')} token={token} />
      <RoleMenuItem label="Admin" onClick={() => handleRoleSwitch('ADMIN')} token={token} />
      <RoleMenuItem label="Employee" onClick={() => handleRoleSwitch('EMPLOYEE')} token={token} />
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null}
        collapsible 
        collapsed={true} 
        width={240}
        collapsedWidth={80} 
        style={{ 
          background: token.colorBgContainer, 
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          position: 'fixed', 
          left: 0, top: 0, bottom: 0, 
          zIndex: 1001 
        }}
      >
        <Flex vertical justify="space-between" style={{ height: '100%' }}>
          
          {/* TOP SECTION */}
          <div>
            <Flex justify="center" align="center" style={{ height: '64px', margin: '16px 0' }}>
              <Avatar 
                shape="square" 
                size={40} 
                style={{ backgroundColor: token.colorPrimary }} 
                icon={<SafetyOutlined />} 
              />
            </Flex>
            
            <Menu 
              theme="light" 
              mode="inline" 
              selectedKeys={[location.pathname]} 
              items={getMenuItems()} 
              onClick={({ key }) => navigate(key)}
              style={{ borderRight: 'none' }}
            />
          </div>

          {/* BOTTOM SECTION */}
          <Flex vertical align="center" style={{ paddingBottom: '16px' }}>
            
            {/* Role Switcher - SVG Trigger with Custom Dropdown */}
            <Dropdown dropdownRender={() => customRoleDropdown} placement="topLeft" trigger={['click']}>
              <div style={{ width: '100%' }}>
                <ActionIcon 
                  icon={UserSwitchOutlined} 
                  defaultColor={token.colorTextSecondary} 
                  hoverColor={token.colorPrimary} 
                  tooltip="Switch Roles"
                />
              </div>
            </Dropdown>

            {/* Visual Divider */}
            <div style={{ width: '40px', borderTop: `1px solid ${token.colorBorderSecondary}`, margin: '4px 0' }} />

            {/* Logout Button */}
            <div style={{ width: '100%' }}>
              <ActionIcon 
                icon={LogoutOutlined} 
                defaultColor={token.colorTextSecondary} 
                hoverColor={token.colorError} 
                tooltip="Sign Out"
                onClick={logout}
              />
            </div>

          </Flex>
        </Flex>
      </Sider>

      <Layout style={{ marginLeft: 80, transition: 'margin-left 0.2s' }}>
        
        {/* HEADER */}
        <Header style={{ background: token.colorBgContainer, padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          
          <Text strong style={{ fontSize: '16px', color: token.colorTextHeading }}>
            {user?.org_name || 'Organization Workspace'}
          </Text>

          <Flex align="center" gap="large">
            <Badge dot>
              <ActionIcon 
                icon={BellOutlined} 
                defaultColor={token.colorTextSecondary} 
                hoverColor={token.colorPrimary} 
              />
            </Badge>
            <Flex align="center" gap="small" style={{ marginLeft: '8px' }}>
              <Avatar icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />
              <Text strong>{user?.email}</Text>
            </Flex>
          </Flex>
        </Header>

        <Content style={{ margin: '24px', background: token.colorBgContainer, padding: 24, borderRadius: '8px', minHeight: 280 }}>
          <Outlet /> 
        </Content>

      </Layout>
    </Layout>
  );
}