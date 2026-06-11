// src/features/auth/pages/LoginPage.jsx
import React, { useState } from 'react';
import { App, Button, Flex, Form, Input, Typography, theme } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { authAPI } from '../api'; // Your axios auth functions

const { Title, Text } = Typography;

export default function LoginPage() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const onFinish = async (values) => {
    try {
      setIsLoading(true);
      
      await authAPI.login(values); 
      
      // 2. WAIT for the AuthContext to fetch the user profile via /me
      await login(); 

      // 3. Now that we know who you are, go to the dashboard
      message.success('Welcome back!');
      navigate('/dashboard');
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', backgroundColor: token.colorBgLayout }}>
      <Flex
        vertical
        gap={token.marginXL}
        style={{ 
          width: '100%', 
          maxWidth: 384, 
          padding: token.paddingXL,
          backgroundColor: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        }}
      >
        <Flex vertical gap={token.marginXS} align="center">
          {/* Placeholder for SVG Logo */}
          <div style={{ width: 48, height: 48, backgroundColor: token.colorInfo, borderRadius: 8, marginBottom: token.marginMD }} />
          <Title level={3} style={{ margin: 0, fontWeight: token.fontWeightStrong, color: token.colorInfo }}>
            Sign in to your account
          </Title>
          <Text style={{ color: token.colorTextSecondary }}>
            Enter your credentials to access the workspace
          </Text>
        </Flex>

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email address"
            rules={[{ required: true, message: 'Please enter your email' }, { type: 'email', message: 'Invalid email' }]}
          >
            <Input size="large" placeholder="name@mnc.com" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password size="large" placeholder="••••••••" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block loading={isLoading}>
            Sign In
          </Button>
        </Form>

        <Flex justify="center">
          <Text style={{ color: token.colorTextSecondary }}>
            Setting up a new organization?{' '}
            <Link to="/register-org" style={{ color: token.colorPrimary, fontWeight: token.fontWeightStrong }}>
              Register here
            </Link>
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}