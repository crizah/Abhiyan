import React, { useState } from 'react';
import { App, Button, Flex, Form, Input, Typography, theme } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../api';
import PixelBlast from '../../../components/ui/PixelBlast';
import Logo from '../../../components/Logo';

const { Title, Text } = Typography;

export default function ResetPasswordPage() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async ({ new_password }) => {
    setLoading(true);
    try {
      await authAPI.resetPassword(resetToken, new_password);
      message.success('Password reset successfully.');
      navigate('/login');
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .reset-root {
          display: flex;
          min-height: 100vh;
          background-color: ${token.colorBgLayout};
        }

        /* LEFT PANEL */
        .reset-brand-wrapper {
          display: flex;
          flex: 1;
          padding: 24px;
          background-color: ${token.colorBgLayout};
        }

        .reset-brand-panel {
          display: flex;
          flex: 1;
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          background-color: #18181B; /* Off-black fallback, no blue cast */
        }

        /* RIGHT PANEL */
        .reset-form-panel {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          background-color: ${token.colorBgLayout};
        }

        .reset-form-container {
          width: 100%;
          max-width: 400px;
        }

        .reset-logo-mark {
          display: block;
          margin: 0 auto 20px;
        }

        /* Tactile feedback: physical push on press, not just color swap */
        .reset-form-container button:active {
          transform: scale(0.98);
        }
        .reset-form-container button {
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Hide brand panel on mobile */
        @media (max-width: 768px) {
          .reset-brand-wrapper {
            display: none;
          }
          .reset-form-panel {
            min-height: 100vh;
          }
        }

        @media (max-width: 400px) {
          .reset-form-panel {
            padding: 24px 16px;
          }
        }
      `}</style>

      <div className="reset-root">
        {/* LEFT — PixelBlast animation fills this panel */}
        <div className="reset-brand-wrapper">
          <div className="reset-brand-panel">
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
        <div className="reset-form-panel">
          <div className="reset-form-container">
            <Flex vertical gap={token.marginXL}>
              <Flex vertical gap={token.marginXS} align="center">
                <Logo size={44} />

                {!resetToken ? (
                  <>
                    <Title level={3} style={{ margin: 0, color: token.colorError, letterSpacing: '-0.02em' }}>
                      Invalid reset link
                    </Title>
                    <Text style={{ color: token.colorTextSecondary, textAlign: 'center' }}>
                      This link is missing a token. Please request a new one.
                    </Text>
                  </>
                ) : (
                  <>
                    <Title level={3} style={{ margin: 0, color: token.colorText, letterSpacing: '-0.02em' }}>
                      Set new password
                    </Title>
                    <Text style={{ color: token.colorTextSecondary }}>
                      Must be at least 8 characters.
                    </Text>
                  </>
                )}
              </Flex>

              {!resetToken ? (
                <Link to="/forgot-password">
                  <Button type="primary" size="large" block>
                    Request new link
                  </Button>
                </Link>
              ) : (
                <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
                  <Form.Item
                    name="new_password"
                    label="New password"
                    rules={[
                      { required: true, message: 'Please enter a new password' },
                      { min: 8, message: 'Password must be at least 8 characters' },
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: token.colorTextQuaternary }} />}
                      size="large"
                      placeholder="••••••••"
                    />
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
                    <Input.Password
                      prefix={<LockOutlined style={{ color: token.colorTextQuaternary }} />}
                      size="large"
                      placeholder="••••••••"
                    />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                    Reset password
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
