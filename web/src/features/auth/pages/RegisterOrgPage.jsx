// src/features/auth/pages/RegisterOrgPage.jsx
import React, { useState } from 'react';
import { App, Button, Flex, Form, Input, Typography, theme, Row, Col } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api';

const { Title, Text } = Typography;

export default function RegisterOrgPage() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const onFinish = async (values) => {
    try {
      setIsLoading(true);
      await authAPI.registerOrg(values);
      message.success('Organization registered successfully! You can now log in.');
      navigate('/login');
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to register organization');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', backgroundColor: token.colorBgLayout, padding: token.paddingXL }}>
      <Flex
        vertical
        gap={token.marginLG}
        style={{ 
          width: '100%', 
          maxWidth: 500, 
          padding: token.paddingXL,
          backgroundColor: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        }}
      >
        <Flex vertical gap={token.marginXS}>
          <Title level={3} style={{ margin: 0, color: token.colorInfo }}>Create Organization</Title>
          <Text style={{ color: token.colorTextSecondary }}>Set up your MNC workspace and Super Admin account.</Text>
        </Flex>

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Title level={5} style={{ marginTop: 0, marginBottom: token.marginMD, color: token.colorPrimary }}>Organization Details</Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="org_name" label="Company Name" rules={[{ required: true }]}>
                <Input placeholder="MNC Corp" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="org_domain" label="Domain (Optional)">
                <Input placeholder="mnc.com" />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ height: 1, backgroundColor: token.colorBorderSecondary, margin: `${token.marginMD}px 0` }} />

          <Title level={5} style={{ marginTop: 0, marginBottom: token.marginMD, color: token.colorPrimary }}>Admin Details</Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="admin_first_name" label="First Name" rules={[{ required: true }]}>
                <Input placeholder="Jane" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="admin_last_name" label="Last Name">
                <Input placeholder="Doe" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="admin_email" label="Admin Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="jane.doe@mnc.com" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="admin_phone" label="Phone Number" rules={[{ required: true }]}>
                <Input placeholder="+1 234 567 8900" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="admin_password" label="Password" rules={[{ required: true, min: 8 }]}>
                <Input.Password placeholder="••••••••" />
              </Form.Item>
            </Col>
          </Row>

          <Button type="primary" htmlType="submit" size="large" block loading={isLoading} style={{ marginTop: token.marginSM }}>
            Create Workspace
          </Button>
        </Form>

        <Flex justify="center">
          <Text style={{ color: token.colorTextSecondary }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: token.colorPrimary, fontWeight: token.fontWeightStrong }}>
              Sign in
            </Link>
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}