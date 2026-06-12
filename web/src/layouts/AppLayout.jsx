import React, { useState } from 'react';
import { Layout, Avatar, Dropdown, Flex, message, theme, Typography, Badge, Tag } from 'antd';
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

import {
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
  CNavItem,
  CDropdown, 
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle
} from '@coreui/react';

import '@coreui/coreui/dist/css/coreui.min.css'; 

const { Header, Content } = Layout;
const { Text } = Typography;

// --- REUSABLE COMPONENTS ---

// 1. Reusable Top Header
const GlobalHeader = ({ user, token, navigate }) => (
  <Header style={{ 
    height: '64px',
    background: token.colorBgContainer, 
    padding: '0 24px', 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
    position: 'sticky',
    top: 0,
    zIndex: 10
  }}>
    <Text strong style={{ fontSize: '16px', color: token.colorTextHeading }}>
      {user?.org_name || 'Organization Workspace'}
    </Text>

    <Flex align="center" gap="large">
      <Badge dot>
        <BellOutlined style={{ fontSize: '20px', cursor: 'pointer', color: token.colorTextSecondary }} />
      </Badge>

     {/* CoreUI Dropdown Integration */}
      <CDropdown variant="nav-item" style={{ listStyle: 'none' }}>
        
        {/* The Toggle */}
        <CDropdownToggle placement="bottom-end" className="py-0 pe-0" caret={false} style={{ background: 'transparent', border: 'none' }}>
          <Flex align="center" gap="small" style={{ cursor: 'pointer' }}>
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />
            
            {/* Stacked Email and Active Role Tag */}
            <Flex vertical align="flex-start" justify="center">
              <Text strong style={{ lineHeight: '1.2' }}>{user?.email}</Text>
              <Tag color="blue" bordered={false} style={{ margin: 0, marginTop: '2px', fontSize: '10px' }}>
                {(user?.role || '').replace('_', ' ')}
              </Tag>
            </Flex>

          </Flex>
        </CDropdownToggle>

        {/* The Dropdown Menu */}
        <CDropdownMenu className="pt-0" placement="bottom-end">
          <CDropdownItem onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
            User Profile
          </CDropdownItem>
          
          {/* Settings Placeholder */}
          <CDropdownItem onClick={(e) => e.preventDefault()} style={{ cursor: 'pointer' }}>
            Settings
          </CDropdownItem>
        </CDropdownMenu>

      </CDropdown>

    </Flex>
  </Header>
);

// 2. Custom Role Menu Item
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
        background: 'transparent'
      }}
    >
      {label}
    </div>
  );
};

// --- MAIN LAYOUT ---

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
      const errorMessage = err.response?.data?.error || "Failed to switch roles";
      message.error(errorMessage);
    }
  };

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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: token.colorBgLayout }}>
      
      {/* CORE UI SIDEBAR */}
      <CSidebar className="border-end" unfoldable style={{ background: token.colorBgContainer, position: 'fixed', zIndex: 1000, height: '100vh' }}>
        <CSidebarHeader 
  className="border-bottom" 
  style={{ 
    height: '64px',            // Force exact match with Ant Design
    display: 'flex', 
    alignItems: 'center',      // Vertically center the Avatar
    justifyContent: 'center',  // Horizontally center the Avatar
    padding: 0                 // Strip out CoreUI's default padding that alters height
  }}
>
  <CSidebarBrand>
    <Avatar shape="square" size={40} style={{ backgroundColor: token.colorPrimary }} icon={<SafetyOutlined />} />
  </CSidebarBrand>
</CSidebarHeader>

        <CSidebarNav>
          <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }} active={location.pathname === '/dashboard'}>
            <DashboardOutlined className="nav-icon" /> Dashboard
          </CNavItem>

          {activeRole === 'SUPER_ADMIN' && (
            <CNavItem href="#" onClick={(e) => { e.preventDefault(); navigate('/users'); }} active={location.pathname === '/users'}>
              <TeamOutlined className="nav-icon" /> User Management
            </CNavItem>
          )}

          <Dropdown dropdownRender={() => customRoleDropdown} placement="topLeft" trigger={['click']}>
            <CNavItem className="mt-auto" href="#" style={{ cursor: 'pointer' }}>
               <UserSwitchOutlined className="nav-icon" /> Switch Roles
            </CNavItem>
          </Dropdown>

          <CNavItem href="#" onClick={logout} style={{ cursor: 'pointer', color: token.colorError }}>
            <LogoutOutlined className="nav-icon" /> Sign Out
          </CNavItem>
        </CSidebarNav>
      </CSidebar>

      {/* ANT DESIGN MAIN CONTENT CONTAINER */}
      <Layout style={{ 
        marginLeft: '64px', // Keeps it permanently shifted past the narrow sidebar
        transition: 'all 0.3s ease-in-out', 
        flexGrow: 1, 
        minHeight: '100vh' 
      }}>
        
        {/* Render our newly extracted Global Header */}
        <GlobalHeader user={user} token={token} navigate={navigate} />

        {/* Dynamic Page Content */}
        <Content style={{ margin: '24px', background: token.colorBgContainer, padding: 24, borderRadius: '8px' }}>
          <Outlet /> 
        </Content>

      </Layout>
    </div>
  );
}