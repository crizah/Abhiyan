import React, { useState } from 'react';
import { App, Button, Card, Flex, Form, Input, Typography, theme } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../api';

const { Title, Text } = Typography;

export default function ResetPasswordPage() {
  const { token: themeToken } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async ({ new_password }) => {
    setLoading(true);
    try {
      await authAPI.resetPassword(token, new_password);
      message.success('Password reset successfully.');
      navigate('/login');
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh', backgroundColor: themeToken.colorBgLayout }}>
        <Card style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <Title level={4} style={{ color: themeToken.colorError, margin: 0 }}>Invalid Reset Link</Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            This link is missing a token. Please request a new one.
          </Text>
          <Link to="/forgot-password">
            <Button type="primary" style={{ marginTop: 24 }} block>Request new link</Button>
          </Link>
        </Card>
      </Flex>
    );
  }

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', backgroundColor: themeToken.colorBgLayout, padding: '24px' }}>
      <Card style={{ width: '100%', maxWidth: 400, boxShadow: themeToken.boxShadowSecondary, borderRadius: themeToken.borderRadiusLG }}>
        <Flex vertical gap={themeToken.marginLG}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0 }}>Set new password</Title>
            <Text type="secondary">Must be at least 8 characters.</Text>
          </div>

          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="new_password"
              label="New password"
              rules={[
                { required: true, message: 'Please enter a new password' },
                { min: 8, message: 'Password must be at least 8 characters' },
              ]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" placeholder="••••••••" />
            </Form.Item>
            <Form.Item
              name="confirm_password"
              label="Confirm password"
              dependencies={['new_password']}
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" placeholder="••••••••" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Reset password
            </Button>
          </Form>
        </Flex>
      </Card>
    </Flex>
  );
}
