import React, { useState } from 'react';
import { Form, Input, Button, Typography, Layout, message, Card } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import apiClient from '../../../config/axios';

const { Title, Text } = Typography;

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Extract the token from the URL query string
  const token = searchParams.get('token');

  const onFinish = async (values) => {
    if (!token) {
      message.error("Invalid or missing invite token.");
      return;
    }

    setLoading(true);
    try {
      // Matches the AcceptInviteRequest struct exactly
      await apiClient.post('/auth/accept-invite', {
        token: token,
        first_name: values.firstName,
        last_name: values.lastName || "",
        phone: values.phone,
        new_password: values.password,
      });

      message.success('Account setup complete! You can now log in.');
      navigate('/login');
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to accept invite. It may have expired.';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Layout style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Card>
          <Title level={4} type="danger">Invalid Invite Link</Title>
          <Text>This link is missing its security token. Please check your email and try again.</Text>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Title level={3} style={{ margin: 0 }}>Complete Your Profile</Title>
          <Text type="secondary">Set up your details to join the workspace</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
        >
          <Form.Item
            label="First Name"
            name="firstName"
            rules={[{ required: true, message: 'Please enter your first name' }]}
          >
            <Input size="large" />
          </Form.Item>

          <Form.Item
            label="Last Name"
            name="lastName"
          >
            <Input size="large" />
          </Form.Item>

          <Form.Item
            label="Phone Number"
            name="phone"
            rules={[{ required: true, message: 'Please enter your phone number' }]}
          >
            <Input size="large" />
          </Form.Item>

          <Form.Item
            label="New Password"
            name="password"
            rules={[
              { required: true, message: 'Please set a password' },
              { min: 8, message: 'Password must be at least 8 characters' }
            ]}
          >
            <Input.Password size="large" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Create Account
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Layout>
  );
}