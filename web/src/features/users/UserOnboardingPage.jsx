import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Form, Input, Select, Button, message, Flex, List, Avatar, Badge } from 'antd';
import { MailOutlined, SafetyCertificateOutlined, UserOutlined, TeamOutlined, InfoCircleOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import Stepper, { Step } from '../../components/ui/Stepper';

const { Title, Text, Paragraph } = Typography;

const infoCardStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  background: 'rgba(179, 69, 92, 0.06)',
  border: '1px solid rgba(179, 69, 92, 0.2)',
  borderRadius: 10,
  padding: '12px 14px',
  marginTop: 20,
};

function InfoCard({ children }) {
  return (
    <div style={infoCardStyle}>
      <InfoCircleOutlined style={{ color: '#B3455C', marginTop: 2, flexShrink: 0 }} />
      <Text style={{ fontSize: 12, color: 'rgba(24, 24, 27, 0.75)', lineHeight: 1.6 }}>{children}</Text>
    </div>
  );
}

export default function UserOnboardingPage() {
  const navigate = useNavigate();
  const [isInviting, setIsInviting] = useState(false);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [stepperKey, setStepperKey] = useState(0);
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
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={3} style={{ marginTop: 0 }}>User Onboarding</Title>
      <Paragraph type="secondary" style={{ marginBottom: 28 }}>
        Walk through inviting a new colleague and getting them set up on a team.
      </Paragraph>

      <Flex gap={24} align="flex-start" wrap="wrap">
        <div style={{ flex: '2 1 460px', minWidth: 320 }}>
          <Stepper
            key={stepperKey}
            backButtonText="Back"
            nextButtonText="Next"
            onFinalStepCompleted={() => setStepperKey(k => k + 1)}
          >
            <Step>
              <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>Invite a Colleague</Title>
              <Paragraph type="secondary" style={{ marginBottom: 20, fontSize: 13 }}>
                Grant system access to a new user. They'll receive an email to set up their profile.
              </Paragraph>

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
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={isInviting}
                  icon={<SafetyCertificateOutlined />}
                  style={{ background: '#B3455C', border: 'none' }}
                >
                  Send Invitation
                </Button>
              </Form>

              <InfoCard>
                Specify the employee's email and the system role you want them to have, you can always
                change their role later from <Link to="/users" style={{ color: '#B3455C', fontWeight: 600 }}>Users</Link>.
                Sending this will email them a secure invite link. Feel free to assign them to a team in the meantime.
              </InfoCard>
            </Step>

            <Step>
              <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>Assign to a Team</Title>
              <Paragraph type="secondary" style={{ marginBottom: 20, fontSize: 13 }}>
                Next, add this employee to a team so they have somewhere to land once they accept.
              </Paragraph>

              <Button
                type="primary"
                size="large"
                block
                icon={<TeamOutlined />}
                onClick={() => navigate('/teams')}
                style={{ background: '#B3455C', border: 'none' }}
              >
                Go to Teams
              </Button>

              <InfoCard>
                To access platform features, a user needs to be part of a team. They won't be able to
                participate in any activities until they accept their invite and are assigned to a team.
              </InfoCard>
            </Step>
          </Stepper>
        </div>

        {/* Unassigned Queue */}
        <div style={{
          flex: '1 1 300px', minWidth: 280,
          border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 16,
          backgroundColor: '#fafafa', padding: 20,
          display: 'flex', flexDirection: 'column', maxHeight: 560,
        }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
            <Title level={5} style={{ margin: 0 }}>Unassigned Queue</Title>
            <Badge count={unassignedTotal} style={{ backgroundColor: '#B3455C' }} />
          </Flex>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 12, display: 'block' }}>
            Invited users still waiting on a team.
          </Text>

          <InfoCard>
            Need to assign these users to a team before they can start taking part on the platform.
          </InfoCard>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, marginTop: 16 }}>
            <List
              size="small"
              loading={loadingQueue}
              dataSource={unassignedUsers}
              renderItem={(user) => (
                <List.Item style={{
                  backgroundColor: '#fff', marginBottom: 8, padding: 12,
                  borderRadius: 10, border: '1px solid rgba(24, 24, 27, 0.08)',
                }}>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: 'rgba(179, 69, 92, 0.15)', color: '#B3455C' }} />}
                    title={<Text strong style={{ fontSize: 13 }}>{user.full_name || 'Pending Acceptance'}</Text>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{user.email_id}</Text>}
                  />
                </List.Item>
              )}
            />
          </div>
        </div>
      </Flex>
    </div>
  );
}
