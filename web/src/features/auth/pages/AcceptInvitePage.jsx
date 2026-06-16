import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Flex, message, theme } from 'antd';
import { LockOutlined, UserOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../../config/axios';

const { Title, Text } = Typography;

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { token: themeToken } = theme.useToken();

  const onFinish = async (values) => {
    if (!token) {
      message.error("Invalid invite link. Missing token.");
      return;
    }

    setLoading(true);
    try {
      // Mapping the form values exactly to your Go schema
      await apiClient.post('/auth/accept-invite', {
        token: token,
        first_name: values.first_name,
        last_name: values.last_name || "", // Last name is optional in your schema
        phone: values.phone,               // Added phone field
        new_password: values.password,     // Mapped to your new_password JSON tag
      });

      message.success("Account fully onboarded. You may now log in.");
      
      // Since your backend doesn't auto-issue an access token here, 
      // we redirect them to the standard login page.
      navigate('/login');
    } catch (error) {
      message.error(error.response?.data?.error || "Failed to accept invite.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh', backgroundColor: themeToken.colorBgLayout }}>
        <Card style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <Title level={4} style={{ color: themeToken.colorError }}>Invalid Invite Link</Title>
          <Text type="secondary">This link is missing a secure token. Please ask your administrator to re-send the invite.</Text>
        </Card>
      </Flex>
    );
  }

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', backgroundColor: themeToken.colorBgLayout, padding: '24px' }}>
      <Card 
        style={{ 
          width: '100%', maxWidth: 450, 
          boxShadow: themeToken.boxShadowSecondary,
          borderRadius: themeToken.borderRadiusLG 
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>Join Your Organization</Title>
          <Text type="secondary">Complete your profile to access your workspace.</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} requiredMark="optional">
          <Flex gap="middle">
            <Form.Item 
              name="first_name" 
              label="First Name" 
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input prefix={<UserOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" />
            </Form.Item>

            <Form.Item 
              name="last_name" 
              label="Last Name" 
              style={{ flex: 1 }}
            >
              <Input size="large" />
            </Form.Item>
          </Flex>

          <Form.Item 
            name="phone" 
            label="Phone Number" 
            rules={[{ required: true, message: 'Phone number is required' }]}
          >
            <Input prefix={<PhoneOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" />
          </Form.Item>

          <Form.Item 
            name="password" 
            label="Create Password" 
            rules={[
              { required: true, message: 'Please create a password.' },
              { min: 8, message: 'Password must be at least 8 characters.' }
            ]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" />
          </Form.Item>

          <Form.Item 
            name="confirm_password" 
            label="Confirm Password" 
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm your password.' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('The two passwords do not match!'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ marginTop: 8 }}>
            Complete Setup
          </Button>
        </Form>
      </Card>
    </Flex>
  );
}