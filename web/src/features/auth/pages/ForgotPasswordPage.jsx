import React, { useState } from 'react';
import { App, Button, Flex, Form, Input, Typography, theme } from 'antd';
import { Link } from 'react-router-dom';
import { authAPI } from '../api';
import PixelBlast from '../../../components/ui/PixelBlast';
import Logo from '../../../components/Logo';

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const { token } = theme.useToken();
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
    <>
      <style>{`
        .forgot-root {
          display: flex;
          min-height: 100vh;
          background-color: ${token.colorBgLayout};
        }

        /* LEFT PANEL */
        .forgot-brand-wrapper {
          display: flex;
          flex: 1;
          padding: 24px;
          background-color: ${token.colorBgLayout};
        }

        .forgot-brand-panel {
          display: flex;
          flex: 1;
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          background-color: #18181B; /* Off-black fallback, no blue cast */
        }

        /* RIGHT PANEL */
        .forgot-form-panel {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          background-color: ${token.colorBgLayout};
        }

        .forgot-form-container {
          width: 100%;
          max-width: 400px;
        }

        .forgot-logo-mark {
          display: block;
          margin: 0 auto 20px;
        }

        /* Tactile feedback: physical push on press, not just color swap */
        .forgot-form-container button:active {
          transform: scale(0.98);
        }
        .forgot-form-container button {
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Hide brand panel on mobile */
        @media (max-width: 768px) {
          .forgot-brand-wrapper {
            display: none;
          }
          .forgot-form-panel {
            min-height: 100vh;
          }
        }
      `}</style>

      <div className="forgot-root">
        {/* LEFT — PixelBlast animation fills this panel */}
        <div className="forgot-brand-wrapper">
          <div className="forgot-brand-panel">
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
        <div className="forgot-form-panel">
          <div className="forgot-form-container">
            <Flex vertical gap={token.marginXL}>
              <Flex vertical gap={token.marginXS} align="center">
                <Logo size={44} />

                {sent ? (
                  <>
                    <Title level={3} style={{ margin: 0, color: token.colorText, letterSpacing: '-0.02em' }}>
                      Check your inbox
                    </Title>
                    <Text style={{ color: token.colorTextSecondary, textAlign: 'center' }}>
                      If that email is registered, a reset link has been sent. It expires in 15 minutes.
                    </Text>
                  </>
                ) : (
                  <>
                    <Title level={3} style={{ margin: 0, color: token.colorText, letterSpacing: '-0.02em' }}>
                      Forgot password?
                    </Title>
                    <Text style={{ color: token.colorTextSecondary, textAlign: 'center' }}>
                      Enter your email and we'll send you a reset link.
                    </Text>
                  </>
                )}
              </Flex>

              {sent ? (
                <Flex justify="center">
                  <Link to="/login" style={{ color: token.colorPrimary, fontWeight: token.fontWeightStrong }}>
                    Back to sign in
                  </Link>
                </Flex>
              ) : (
                <>
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
                    <Link to="/login" style={{ color: token.colorTextSecondary }}>
                      Back to sign in
                    </Link>
                  </Flex>
                </>
              )}
            </Flex>
          </div>
        </div>
      </div>
    </>
  );
}
