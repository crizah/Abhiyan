import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Form, Input, Select, Button, message, Flex, List, Avatar, Badge } from 'antd';
import { MailOutlined, SafetyCertificateOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import apiClient from '../../config/axios';
import Stepper, { Step } from '../../components/ui/Stepper';
import InfoCard from '../../components/InfoCard';

const { Title, Text, Paragraph } = Typography;

export default function UserOnboardingPage() {
  const navigate = useNavigate();
  const [isInviting, setIsInviting] = useState(false);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [invitedTotal, setInvitedTotal] = useState(0);
  const [loadingInvited, setLoadingInvited] = useState(true);
  const [resendingId, setResendingId] = useState(null);
  const [stepperKey, setStepperKey] = useState(0);
  const [inviteForm] = Form.useForm();

  useEffect(() => {
    fetchUnassignedQueue();
    fetchInvitedQueue();
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

  const fetchInvitedQueue = async () => {
    setLoadingInvited(true);
    try {
      const response = await apiClient.get('/admin/users', { params: { page: 1, pageSize: 20, status: 'INVITED' } });
      setInvitedUsers(response.data.users || []);
      setInvitedTotal(response.data.total_count || 0);
    } catch (error) {
      setInvitedUsers([]);
      setInvitedTotal(0);
    } finally {
      setLoadingInvited(false);
    }
  };

  const handleInviteSubmit = async (values) => {
    setIsInviting(true);
    try {
      await apiClient.post('/admin/users/invite', values);
      message.success(`System invite sent to ${values.email}`);
      inviteForm.resetFields();
      fetchUnassignedQueue(); // Refresh queue immediately
      fetchInvitedQueue();
    } catch (error) {
      message.error(error.response?.data?.error || "Failed to send invite");
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendInvite = async (userId) => {
    setResendingId(userId);
    try {
      await apiClient.post(`/admin/users/${userId}/resend-invite`);
      message.success('Invite resent successfully');
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to resend invite');
    } finally {
      setResendingId(null);
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

              <InfoCard style={{ marginTop: 20 }}>
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

              <InfoCard style={{ marginTop: 20 }}>
                To access platform features, a user needs to be part of a team. They won't be able to
                participate in any activities until they accept their invite and are assigned to a team.
              </InfoCard>
            </Step>
          </Stepper>
        </div>

        {/* Onboarding Queues — unassigned users (left) and pending invites (right) */}
        <div style={{
          flex: '2 1 560px', minWidth: 300,
          border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 16,
          backgroundColor: '#fafafa', padding: 20,
          display: 'flex', flexDirection: 'column', maxHeight: 560,
        }}>
          <InfoCard style={{ marginBottom: 16 }}>
            Assign unassigned users to a team, or resend an invite link to anyone still waiting to accept.
          </InfoCard>

          <Flex gap={16} wrap="wrap" style={{ flex: 1, minHeight: 0 }}>
            <div style={{ flex: '1 1 240px', minWidth: 240, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                <Title level={5} style={{ margin: 0, fontSize: 15 }}>Unassigned Queue</Title>
                <Badge count={unassignedTotal} style={{ backgroundColor: '#B3455C' }} />
              </Flex>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 12, display: 'block' }}>
                Invited users still waiting on a team.
              </Text>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
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
                      {user.status === 'INVITED' && (
                        <Button
                          size="small"
                          loading={resendingId === user.id}
                          onClick={() => handleResendInvite(user.id)}
                          style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
                        >
                          Resend
                        </Button>
                      )}
                    </List.Item>
                  )}
                />
              </div>
            </div>

            <div style={{ flex: '1 1 240px', minWidth: 240, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                <Title level={5} style={{ margin: 0, fontSize: 15 }}>Invited Queue</Title>
                <Badge count={invitedTotal} style={{ backgroundColor: '#B3455C' }} />
              </Flex>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 12, display: 'block' }}>
                Waiting on the invitee to accept.
              </Text>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                <List
                  size="small"
                  loading={loadingInvited}
                  dataSource={invitedUsers}
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
                      <Button
                        size="small"
                        loading={resendingId === user.id}
                        onClick={() => handleResendInvite(user.id)}
                        style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
                      >
                        Resend
                      </Button>
                    </List.Item>
                  )}
                />
              </div>
            </div>
          </Flex>
        </div>
      </Flex>
    </div>
  );
}
