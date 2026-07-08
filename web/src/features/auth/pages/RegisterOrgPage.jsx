// src/features/auth/pages/RegisterOrgPage.jsx
import React, { useState } from 'react';
import { App, Button, Flex, Form, Input, Typography, theme, Row, Col } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api';
import PixelBlast from '../../../components/ui/PixelBlast';
import Logo from '../../../components/Logo';

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
    <>
      <style>{`
        .register-root {
          display: flex;
          min-height: 100vh;
          background-color: ${token.colorBgLayout};
        }

        /* LEFT PANEL */
        .register-brand-wrapper {
          display: flex;
          flex: 1;
          padding: 24px;
          background-color: ${token.colorBgLayout};
        }

        .register-brand-panel {
          display: flex;
          flex: 1;
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          background-color: #18181B; /* Off-black fallback, no blue cast */
        }

        /* RIGHT PANEL */
        .register-form-panel {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          background-color: ${token.colorBgLayout};
        }

        .register-form-container {
          width: 100%;
          max-width: 500px; /* Slightly wider than login for the 2-column grid */
        }

        .register-logo-mark {
          display: block;
          margin: 0 auto 16px;
        }

        /* Tactile feedback: physical push on press, not just color swap */
        .register-form-container button:active {
          transform: scale(0.98);
        }
        .register-form-container button {
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Hide brand panel on mobile */
        @media (max-width: 768px) {
          .register-brand-wrapper {
            display: none;
          }
          .register-form-panel {
            min-height: 100vh;
          }
        }
      `}</style>

      <div className="register-root">
        {/* LEFT — PixelBlast entirely fills this panel */}
        <div className="register-brand-wrapper">
          <div className="register-brand-panel">
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

        {/* RIGHT — Registration form directly on background */}
        <div className="register-form-panel">
          <div className="register-form-container">
            <Flex vertical gap={token.marginLG}>
              <Flex vertical gap={token.marginXS} align="center" style={{ textAlign: 'center' }}>
                <Logo size={44} />
                <Title level={3} style={{ margin: 0, color: token.colorText, letterSpacing: '-0.02em' }}>
                  Create Organization
                </Title>
                <Text style={{ color: token.colorTextSecondary }}>
                  Set up your MNC workspace and Super Admin account.
                </Text>
              </Flex>

              <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
                <Title level={5} style={{ marginTop: 0, marginBottom: token.marginMD, color: token.colorPrimary }}>
                  Organization Details
                </Title>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="org_name" label="Company Name" rules={[{ required: true }]}>
                      <Input size="large" placeholder="MNC Corp" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="org_domain" label="Domain (Optional)">
                      <Input size="large" placeholder="mnc.com" />
                    </Form.Item>
                  </Col>
                </Row>

                <div style={{ height: 2, backgroundColor: token.colorBorder, margin: `${token.marginSM}px 0` }} />

                <Title level={5} style={{ marginTop: 0, marginBottom: token.marginMD, color: token.colorPrimary }}>
                  Admin Details
                </Title>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="admin_first_name" label="First Name" rules={[{ required: true }]}>
                      <Input size="large" placeholder="Jane" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="admin_last_name" label="Last Name">
                      <Input size="large" placeholder="Doe" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="admin_email" label="Admin Email" rules={[{ required: true, type: 'email' }]}>
                  <Input size="large" placeholder="jane.doe@mnc.com" />
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="admin_phone" label="Phone Number" rules={[{ required: true }]}>
                      <Input size="large" placeholder="+1 234 567 8900" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="admin_password" label="Password" rules={[{ required: true, min: 8 }]}>
                      <Input.Password size="large" placeholder="••••••••" />
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
          </div>
        </div>
      </div>
    </>
  );
}
