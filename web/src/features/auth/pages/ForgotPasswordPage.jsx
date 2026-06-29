import React, { useState } from 'react';
import { App, Button, Card, Flex, Form, Input, Typography, theme } from 'antd';
import { Link } from 'react-router-dom';
import { authAPI } from '../api';

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const { token: themeToken } = theme.useToken();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onFinish = async ({ email }) => {
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch {
      message.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', backgroundColor: themeToken.colorBgLayout, padding: '24px' }}>
      <Card style={{ width: '100%', maxWidth: 400, boxShadow: themeToken.boxShadowSecondary, borderRadius: themeToken.borderRadiusLG }}>
        {sent ? (
          <Flex vertical gap={themeToken.marginMD} align="center" style={{ textAlign: 'center' }}>
            <Title level={4} style={{ margin: 0 }}>Check your inbox</Title>
            <Text type="secondary">
              If that email is registered, a reset link has been sent. It expires in 15 minutes.
            </Text>
            <Link to="/login">Back to sign in</Link>
          </Flex>
        ) : (
          <Flex vertical gap={themeToken.marginLG}>
            <div style={{ textAlign: 'center' }}>
              <Title level={3} style={{ margin: 0 }}>Forgot password?</Title>
              <Text type="secondary">Enter your email and we'll send you a reset link.</Text>
            </div>

            <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
              <Form.Item
                name="email"
                label="Email address"
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Invalid email' },
                ]}
              >
                <Input size="large" placeholder="name@mnc.com" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                Send reset link
              </Button>
            </Form>

            <Flex justify="center">
              <Link to="/login" style={{ color: themeToken.colorTextSecondary }}>Back to sign in</Link>
            </Flex>
          </Flex>
        )}
      </Card>
    </Flex>
  );
}
