import React, { useState } from 'react';
import { Typography, Card, Form, Input, Select, Button, message, Flex, Divider, Alert } from 'antd';
import { MailOutlined, SafetyCertificateOutlined, TeamOutlined, PlusOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';

const { Title, Text, Paragraph } = Typography;

export default function UserOnboardingPage() {
  const [isInviting, setIsInviting] = useState(false);
  const [inviteForm] = Form.useForm();

  // Handle System Level Invites
  const handleInviteSubmit = async (values) => {
    setIsInviting(true);
    try {
      await apiClient.post('/admin/users/invite', {
        email: values.email,
        role: values.role
      });
      
      message.success(`System invite sent to ${values.email}`);
      inviteForm.resetFields();
    } catch (error) {
      const errorMsg = error.response?.data?.error || "Failed to send invite";
      message.error(errorMsg);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: '8px' }}>User Onboarding</Title>
      <Paragraph type="secondary" style={{ marginBottom: '32px' }}>
        Invite new employees to the workspace and manage their initial access levels.
      </Paragraph>

      <Flex gap="large" align="flex-start" wrap="wrap">
        
        {/* --- STEP 1: SYSTEM ONBOARDING --- */}
        <Card 
          title={<><SafetyCertificateOutlined style={{ marginRight: '8px' }} /> System Access</>} 
          style={{ flex: 1, minWidth: '400px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        >
          <Alert 
            message="Step 1: Invite to Organization" 
            description="Send an email invitation. The user will be prompted to set up their password and profile." 
            type="info" 
            showIcon 
            style={{ marginBottom: '24px' }}
          />

          <Form
            form={inviteForm}
            layout="vertical"
            onFinish={handleInviteSubmit}
            initialValues={{ role: 'EMPLOYEE' }}
          >
            <Form.Item
              label={<Text strong>Email Address</Text>}
              name="email"
              rules={[
                { required: true, message: 'Please enter an email' },
                { type: 'email', message: 'Please enter a valid email' }
              ]}
            >
              <Input size="large" prefix={<MailOutlined />} placeholder="colleague@company.com" />
            </Form.Item>

            <Form.Item
              label={<Text strong>System Role</Text>}
              name="role"
              rules={[{ required: true }]}
              extra="Determines their base level of access across the entire organization."
            >
              <Select size="large">
                <Select.Option value="SUPER_ADMIN">Super Admin (Full Org Access)</Select.Option>
                <Select.Option value="ADMIN">Admin (Team Management)</Select.Option>
                <Select.Option value="EMPLOYEE">Employee (Standard Access)</Select.Option>
              </Select>
            </Form.Item>

            <Divider />

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" size="large" block loading={isInviting}>
                Send Invitation Email
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* --- STEP 2: TEAM ONBOARDING (Placeholder for next step) --- */}
        <Card 
          title={<><TeamOutlined style={{ marginRight: '8px' }} /> Team Assignment</>} 
          style={{ flex: 1, minWidth: '400px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        >
          <Alert 
            message="Step 2: Assign to Teams" 
            description="Assign active or invited users to specific teams." 
            type="warning" 
            showIcon 
            style={{ marginBottom: '24px' }}
          />

          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <TeamOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
            <Title level={5} style={{ color: '#8c8c8c' }}>Team Management Endpoints Required</Title>
            <Text type="secondary">
              We will build the endpoints to create teams and assign members here next!
            </Text>
            <br />
            <Button type="dashed" icon={<PlusOutlined />} style={{ marginTop: '24px' }} disabled>
              Create New Team
            </Button>
          </div>
        </Card>

      </Flex>
    </div>
  );
}