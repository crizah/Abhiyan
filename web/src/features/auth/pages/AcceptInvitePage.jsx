import React, { useState } from 'react';
import { Form, Input, Button, Typography, Flex, Row, Col, message, theme } from 'antd';
import { LockOutlined, UserOutlined, PhoneOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../../config/axios';
import PixelBlast from '../../../components/ui/PixelBlast';
import Logo from '../../../components/Logo';

const { Title, Text } = Typography;

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [resending, setResending] = useState(false);

  const navigate = useNavigate();
  const { token: themeToken } = theme.useToken();

  const onFinish = async (values) => {
    if (!token) {
      message.error("Invalid invite link. Missing token.");
      return;
    }

    setLoading(true);
    setTokenExpired(false);
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
      const errMsg = error.response?.data?.error || "Failed to accept invite.";
      message.error(errMsg);

      // If the backend specifically kicks back an expiration/invalid error, flip the state
      if (errMsg.includes("expired") || errMsg.includes("invalid")) {
        setTokenExpired(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvite = async () => {
    setResending(true);
    try {
      await apiClient.post('/auth/resend-invite', { token: token });
      message.success("A fresh invite link has been sent to your email!");
      setTokenExpired(false); // Hide the button after success
    } catch (error) {
      message.error(error.response?.data?.error || "Failed to resend invite.");
    } finally {
      setResending(false);
    }
  };

  const invalid = !token || tokenExpired;

  return (
    <>
      <style>{`
        .invite-root {
          display: flex;
          min-height: 100vh;
          background-color: ${themeToken.colorBgLayout};
        }

        /* LEFT PANEL */
        .invite-brand-wrapper {
          display: flex;
          flex: 1;
          padding: 24px;
          background-color: ${themeToken.colorBgLayout};
        }

        .invite-brand-panel {
          display: flex;
          flex: 1;
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          background-color: #18181B; /* Off-black fallback, no blue cast */
        }

        /* RIGHT PANEL */
        .invite-form-panel {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          background-color: ${themeToken.colorBgLayout};
        }

        .invite-form-container {
          width: 100%;
          max-width: 450px;
        }

        .invite-logo-mark {
          display: block;
          margin: 0 auto 20px;
        }

        /* Tactile feedback: physical push on press, not just color swap */
        .invite-form-container button:active {
          transform: scale(0.98);
        }
        .invite-form-container button {
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Hide brand panel on mobile */
        @media (max-width: 768px) {
          .invite-brand-wrapper {
            display: none;
          }
          .invite-form-panel {
            min-height: 100vh;
          }
        }

        @media (max-width: 400px) {
          .invite-form-panel {
            padding: 24px 16px;
          }
        }
      `}</style>

      <div className="invite-root">
        {/* LEFT — PixelBlast animation fills this panel */}
        <div className="invite-brand-wrapper">
          <div className="invite-brand-panel">
            <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <PixelBlast
                variant="square"
                pixelSize={4}
                color="#E1637C"
                patternScale={2}
                patternDensity={1}
                pixelSizeJitter={0}
                enableRipples
                rippleSpeed={0.4}
                rippleThickness={0.12}
                rippleIntensityScale={1.5}
                liquid={false}
                liquidStrength={0.12}
                liquidRadius={1.2}
                liquidWobbleSpeed={5}
                speed={0.5}
                edgeFade={0.25}
                transparent
              />
            </div>
          </div>
        </div>

        {/* RIGHT — Form directly on background */}
        <div className="invite-form-panel">
          <div className="invite-form-container">
            <Flex vertical gap={themeToken.marginXL}>
              <Flex vertical gap={themeToken.marginXS} align="center" style={{ textAlign: 'center' }}>
                <Logo size={44} />

                {invalid ? (
                  <>
                    <Title level={3} style={{ margin: 0, color: themeToken.colorError, letterSpacing: '-0.02em' }}>
                      {!token ? "Invalid invite link" : "Invite link expired"}
                    </Title>
                    <Text style={{ color: themeToken.colorTextSecondary }}>
                      {!token
                        ? "This link is missing a secure token. Please ask your administrator to re-send the invite."
                        : "For your security, invite links expire after 48 hours. Click below to email yourself a fresh link."}
                    </Text>
                  </>
                ) : (
                  <>
                    <Title level={3} style={{ margin: 0, color: themeToken.colorText, letterSpacing: '-0.02em' }}>
                      Join your organization
                    </Title>
                    <Text style={{ color: themeToken.colorTextSecondary }}>
                      Complete your profile to access your workspace.
                    </Text>
                  </>
                )}
              </Flex>

              {invalid ? (
                <>
                  {tokenExpired && (
                    <Button type="primary" size="large" block loading={resending} onClick={handleResendInvite}>
                      Email me a new invite link
                    </Button>
                  )}
                  <Flex justify="center">
                    <Link to="/login" style={{ color: themeToken.colorTextSecondary }}>
                      Back to sign in
                    </Link>
                  </Flex>
                </>
              ) : (
                <Form layout="vertical" onFinish={onFinish} requiredMark="optional">
                  <Row gutter={[16, 0]}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="first_name"
                        label="First Name"
                        rules={[{ required: true, message: 'First name is required' }]}
                      >
                        <Input prefix={<UserOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="last_name"
                        label="Last Name"
                      >
                        <Input size="large" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name="phone"
                    label="Phone Number"
                    rules={[
                      { required: true, message: 'Phone number is required' },
                      { pattern: /^[6-9]\d{9}$/, message: 'Enter a valid 10-digit phone number (no country code)' },
                    ]}
                  >
                    <Input prefix={<PhoneOutlined style={{ color: themeToken.colorTextQuaternary }} />} size="large" placeholder="9876543210" maxLength={10} />
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
              )}
            </Flex>
          </div>
        </div>
      </div>
    </>
  );
}
