import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Row, Col, Tag, Spin, message, Divider } from 'antd';
import apiClient from '../../config/axios';

const { Title, Text } = Typography;

export default function UserProfilePage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProfile = async () => {
    try {
      // We will build this new User Domain endpoint next
      const response = await apiClient.get('/users/me/profile');
      setProfileData(response.data);
      form.setFieldsValue({
        firstName: response.data.first_name,
        lastName: response.data.last_name,
        phone: response.data.phone_number,
      });
    } catch (error) {
      message.error("Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await apiClient.put('/users/me/profile', {
        first_name: values.firstName,
        last_name: values.lastName,
        phone_number: values.phone,
      });
      message.success("Profile updated successfully!");
    } catch (error) {
      message.error("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }} />;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Title level={3}>My Profile</Title>
      
      <Row gutter={[24, 24]}>
        {/* EDITABLE SETTINGS COLUMN */}
        <Col xs={24} md={12}>
          <Card title="Personal Information" bordered={false} style={{ height: '100%' }}>
            <Form form={form} layout="vertical" onFinish={onFinish}>
              
              <Form.Item label="Email Address">
                <Input value={profileData?.email_id} disabled />
                <Text type="secondary" style={{ fontSize: '12px' }}>Email cannot be changed.</Text>
              </Form.Item>

              <Form.Item label="First Name" name="firstName" rules={[{ required: true }]}>
                <Input size="large" />
              </Form.Item>

              <Form.Item label="Last Name" name="lastName">
                <Input size="large" />
              </Form.Item>

              <Form.Item label="Phone Number" name="phone">
                <Input size="large" />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={saving} size="large">
                Save Changes
              </Button>
            </Form>
          </Card>
        </Col>

        {/* READ-ONLY SECURITY & TEAM COLUMN */}
        <Col xs={24} md={12}>
          <Card title="System & Team Access" bordered={false} style={{ height: '100%' }}>
            
            <div style={{ marginBottom: '16px' }}>
              <Text strong>Organization</Text>
              <br />
              <Text>{profileData?.org_name}</Text>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text strong>System Roles</Text>
              <br />
              {profileData?.system_roles?.map(role => (
                <Tag color="blue" key={role}>{role}</Tag>
              ))}
            </div>

            <Divider />

            <Title level={5}>My Teams</Title>
            {profileData?.teams?.length > 0 ? (
              profileData.teams.map((team, idx) => (
                <Card type="inner" title={team.team_name} key={idx} style={{ marginBottom: '16px' }}>
                  <Text strong>My Role:</Text> <Tag color="cyan">{team.user_team_role}</Tag>
                  <br />
                  <Text strong style={{ marginTop: '8px', display: 'block' }}>Team Admins:</Text>
                  {team.team_admin_emails.length > 0 
                    ? team.team_admin_emails.map(email => <Text display="block" key={email}>• {email}</Text>)
                    : <Text type="secondary">No admins assigned</Text>
                  }
                </Card>
              ))
            ) : (
              <Text type="secondary">You are not assigned to any teams.</Text>
            )}

          </Card>
        </Col>
      </Row>
    </div>
  );
}