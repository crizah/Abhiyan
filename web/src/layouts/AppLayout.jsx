import React, { useState } from 'react';
import { Layout, Avatar, Dropdown, Flex, message, theme, Typography, Badge, Tag } from 'antd';
import { 
  DashboardOutlined, 
  TeamOutlined, 
  BellOutlined, 
  LogoutOutlined,
  UserSwitchOutlined,
  UserOutlined,
  SafetyOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../config/axios';
import { ROLE_COLORS } from '../utils/colorMaps'; // <-- Import the color map here

import {
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
  CNavItem,
} from '@coreui/react';

import '@coreui/coreui/dist/css/coreui.min.css'; 

const { Header, Content } = Layout;
const { Text } = Typography;

// --- REUSABLE COMPONENTS ---

// 1. Universal Menu Item (Used for both Roles and Header Dropdowns)
const StandardMenuItem = ({ label, icon, onClick, token }) => {
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
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'transparent'
      }}
    >
      {icon && (
        <span style={{ color: isHovered ? token.colorPrimary : token.colorTextSecondary, display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
      )}
      {label}
    </div>
  );
};

// 2. Reusable Top Header
const GlobalHeader = ({ user, token, navigate }) => {
  
  const customHeaderDropdown = (
    <div style={{
      backgroundColor: token.colorBgElevated,
      borderRadius: token.borderRadiusLG,
      boxShadow: token.boxShadowSecondary,
      padding: '8px 0',
      minWidth: '160px'
    }}>
      <StandardMenuItem 
        label="User Profile" 
        icon={<UserOutlined />} 
        onClick={() => navigate('/profile')} 
        token={token} 
      />
      <StandardMenuItem 
        label="Settings" 
        icon={<SettingOutlined />} 
        onClick={(e) => e.preventDefault()} 
        token={token} 
      />
    </div>
  );

  return (
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

        <Dropdown dropdownRender={() => customHeaderDropdown} placement="bottomRight" trigger={['click']}>
          <Flex align="center" gap="small" style={{ cursor: 'pointer' }}>
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />
            
            <Flex vertical align="flex-start" justify="center">
              <Text strong style={{ lineHeight: '1.2' }}>{user?.email}</Text>
              <Tag 
                color={ROLE_COLORS[user?.role] || 'blue'} // Dynamic color mapping!
                bordered={false} 
                style={{ margin: 0, marginTop: '2px', fontSize: '10px' }}
              >
                {(user?.role || '').replace('_', ' ')}
              </Tag>
            </Flex>
          </Flex>
        </Dropdown>

      </Flex>
    </Header>
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
      <StandardMenuItem label="Super Admin" onClick={() => handleRoleSwitch('SUPER_ADMIN')} token={token} />
      <StandardMenuItem label="Admin" onClick={() => handleRoleSwitch('ADMIN')} token={token} />
      <StandardMenuItem label="Employee" onClick={() => handleRoleSwitch('EMPLOYEE')} token={token} />
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: token.colorBgLayout }}>
      
      {/* CORE UI SIDEBAR */}
      <CSidebar className="border-end" unfoldable style={{ background: token.colorBgContainer, position: 'fixed', zIndex: 1000, height: '100vh' }}>
        <CSidebarHeader 
          className="border-bottom" 
          style={{ 
            height: '64px',
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
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
            <CNavItem 
              href="#" 
              onClick={(e) => { 
                e.preventDefault(); 
                navigate('/user-management'); // <-- New path!
              }} 
              active={location.pathname === '/user-management'} // <-- Keeps the button highlighted when active
            >
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
        marginLeft: '64px', 
        transition: 'all 0.3s ease-in-out', 
        flexGrow: 1, 
        minHeight: '100vh' 
      }}>
        
        <GlobalHeader user={user} token={token} navigate={navigate} />

        <Content style={{ margin: '24px', background: token.colorBgContainer, padding: 24, borderRadius: '8px' }}>
          <Outlet /> 
        </Content>

      </Layout>
    </div>
  );
}