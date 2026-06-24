import React, { useState, useEffect } from 'react';
import { Typography, Card, Form, Input, Select, Button, message, Flex, Divider, List, Avatar, Badge } from 'antd';
import { MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';

const { Title, Text, Paragraph } = Typography;

export default function UserOnboardingPage() {
  const [isInviting, setIsInviting] = useState(false);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [inviteForm] = Form.useForm();

  useEffect(() => {
    fetchUnassignedQueue();
  }, []);

  const fetchUnassignedQueue = async () => {
    setLoadingQueue(true);
    try {
      const response = await apiClient.get('/admin/users/unassigned', { params: { page: 1, limit: 20 } });
      setUnassignedUsers(response.data.users || []);
      setUnassignedTotal(response.data.total_count || 0);
    } catch (error) {
      setUnassignedUsers([]);
      setUnassignedTotal(0);
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleInviteSubmit = async (values) => {
    setIsInviting(true);
    try {
      await apiClient.post('/admin/users/invite', values);
      message.success(`System invite sent to ${values.email}`);
      inviteForm.resetFields();
      fetchUnassignedQueue(); // Refresh queue immediately
    } catch (error) {
      message.error(error.response?.data?.error || "Failed to send invite");
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
      
      {/* CENTER: Main Invite Area */}
      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
        <div style={{ maxWidth: '500px', width: '100%', marginTop: '4vh' }}>
          <Title level={3} style={{ textAlign: 'center', marginBottom: '8px' }}>Invite Colleague</Title>
          <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: '32px' }}>
            Grant system access to a new user. They will receive an email to set up their profile.
          </Paragraph>

          <Card style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: '12px' }}>
            <Form form={inviteForm} layout="vertical" onFinish={handleInviteSubmit} initialValues={{ role: 'EMPLOYEE' }}>
              <Form.Item label={<Text strong>Email Address</Text>} name="email" rules={[{ required: true, type: 'email' }]}>
                <Input size="large" prefix={<MailOutlined />} placeholder="colleague@company.com" />
              </Form.Item>
              <Form.Item label={<Text strong>System Role</Text>} name="role" rules={[{ required: true }]}>
                <Select size="large">
                  <Select.Option value="SUPER_ADMIN">Super Admin (Full Access)</Select.Option>
                  <Select.Option value="ADMIN">Admin (Team Management)</Select.Option>
                  <Select.Option value="EMPLOYEE">Employee (Standard)</Select.Option>
                </Select>
              </Form.Item>
              <Divider />
              <Button type="primary" htmlType="submit" size="large" block loading={isInviting} icon={<SafetyCertificateOutlined />}>
                Send Invitation
              </Button>
            </Form>
          </Card>
        </div>
      </div>

      {/* RIGHT CORNER: Scrollable Queue Sidebar */}
      <div style={{ width: '350px', borderLeft: '1px solid #f0f0f0', backgroundColor: '#fafafa', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: '16px' }}>
          <Title level={5} style={{ margin: 0 }}>Unassigned Queue</Title>
          <Badge count={unassignedTotal} style={{ backgroundColor: '#fa8c16' }} />
        </Flex>
        <Text type="secondary" style={{ fontSize: '12px', marginBottom: '16px', display: 'block' }}>
          Users requiring team assignment
        </Text>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
          <List
            size="small"
            loading={loadingQueue}
            dataSource={unassignedUsers}
            renderItem={(user) => (
              <List.Item style={{ backgroundColor: '#fff', marginBottom: '8px', padding: '12px', borderRadius: '8px', border: '1px solid #f0f0f0' }}>
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} />}
                  title={<Text strong style={{ fontSize: '13px' }}>{user.full_name || 'Pending Acceptance'}</Text>}
                  description={<Text type="secondary" style={{ fontSize: '12px' }}>{user.email_id}</Text>}
                />
              </List.Item>
            )}
          />
        </div>
      </div>

    </div>
  );
}