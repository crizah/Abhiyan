import React, { useState } from 'react';
import { Layout, Avatar, Dropdown, Flex, message, theme, Typography, Badge } from 'antd';
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
} from '@coreui/react';

// Required for CoreUI styling to work
import '@coreui/coreui/dist/css/coreui.min.css'; 

const { Header, Content } = Layout;
const { Text } = Typography;

// --- Custom Components ---

// The Custom Role Menu Item (Unchanged)
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
      window.location.reload(); 
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      
      {/* --- CORE UI SIDEBAR START --- */}
      {/* The 'unfoldable' prop makes it narrow by default and expand on hover */}
      <CSidebar className="border-end" unfoldable style={{ background: token.colorBgContainer }}>
        
        <CSidebarHeader className="border-bottom" style={{ justifyContent: 'center' }}>
          <CSidebarBrand>
            <Avatar 
              shape="square" 
              size={40} 
              style={{ backgroundColor: token.colorPrimary }} 
              icon={<SafetyOutlined />} 
            />
          </CSidebarBrand>
        </CSidebarHeader>

        <CSidebarNav>
          {/* Main Navigation Items */}
          <CNavItem 
            href="#" 
            onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}
            active={location.pathname === '/dashboard'}
          >
            {/* Adding className="nav-icon" tells CoreUI to keep this visible when narrow */}
            <DashboardOutlined className="nav-icon" /> 
            Dashboard
          </CNavItem>

          {activeRole === 'SUPER_ADMIN' && (
            <CNavItem 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate('/users'); }}
              active={location.pathname === '/users'}
            >
              <TeamOutlined className="nav-icon" /> 
              User Management
            </CNavItem>
          )}

          {/* BOTTOM ACTIONS (Replaces the Download / Try Pro buttons) */}
          {/* mt-auto pushes everything below it to the bottom of the sidebar */}
          <Dropdown dropdownRender={() => customRoleDropdown} placement="topLeft" trigger={['click']}>
            <CNavItem className="mt-auto" href="#" style={{ cursor: 'pointer' }}>
               <UserSwitchOutlined className="nav-icon" /> 
               Switch Roles
            </CNavItem>
          </Dropdown>

          <CNavItem href="#" onClick={logout} style={{ cursor: 'pointer', color: token.colorError }}>
            <LogoutOutlined className="nav-icon" /> 
            Sign Out
          </CNavItem>

        </CSidebarNav>
      </CSidebar>
      {/* --- CORE UI SIDEBAR END --- */}

      {/* --- ANT DESIGN MAIN CONTENT --- */}
      {/* --- ANT DESIGN MAIN CONTENT --- */}
{/* Added marginLeft: '64px' (CoreUI's default narrow width) and a smooth transition */}
<Layout style={{ 
  marginLeft: '64px', 
  transition: 'all 0.3s ease-in-out', 
  flexGrow: 1, 
  minHeight: '100vh' 
}}>
        
        {/* HEADER */}
        <Header style={{ background: token.colorBgContainer, padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Text strong style={{ fontSize: '16px', color: token.colorTextHeading }}>
            {user?.org_name || 'Organization Workspace'}
          </Text>

          <Flex align="center" gap="large">
            <Badge dot>
              {/* Note: I removed ActionIcon here and just used a simple mapped icon to keep it clean */}
              <BellOutlined style={{ fontSize: '20px', cursor: 'pointer', color: token.colorTextSecondary }} />
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
    </div>
  );
}