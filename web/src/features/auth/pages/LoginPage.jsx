// src/features/auth/pages/LoginPage.jsx
import React, { useState } from 'react';
import { App, Button, Flex, Form, Input, Typography, theme } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { authAPI } from '../api';
import PixelBlast from '../../../components/ui/PixelBlast';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const onFinish = async (values) => {
    try {
      setIsLoading(true);
      await authAPI.login(values);
      // 2. WAIT for the AuthContext to fetch the user profile via /me
      await login();
      // 3. Now that we know who you are, go to the dashboard
      message.success('Welcome back!');
      navigate('/dashboard');
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .login-root {
          display: flex;
          min-height: 100vh;
          background-color: ${token.colorBgLayout};
        }

        /* LEFT PANEL */
        .login-brand-wrapper {
          display: flex;
          flex: 1;
          padding: 24px;
        }

        .login-brand-panel {
          display: flex;
          flex: 1;
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          background-color: #18181B; /* Off-black fallback, no blue cast */
        }

        /* RIGHT PANEL */
        .login-form-panel {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
        }

        .login-form-container {
          width: 100%;
          max-width: 440px;
        }

        .login-logo-mark {
          display: block;
          margin: 0 auto 20px;
        }

        /* Tactile feedback: physical push on press, not just color swap */
        .login-form-container button:active {
          transform: scale(0.98);
        }
        .login-form-container button {
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        /* Hide brand panel on mobile */
        @media (max-width: 768px) {
          .login-brand-wrapper {
            display: none;
          }
          .login-form-panel {
            min-height: 100vh;
          }
        }
      `}</style>

      <div className="login-root">
        {/* LEFT — PixelBlast animation fills this panel */}
        <div className="login-brand-wrapper">
          <div className="login-brand-panel">
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

        {/* RIGHT — Sign-in form directly on background */}
        <div className="login-form-panel">
          <div className="login-form-container">
            <Flex vertical gap={token.marginXL}>
              <Flex vertical gap={token.marginXS} align="center">
                <svg
                  className="login-logo-mark"
                  width="44"
                  height="44"
                  viewBox="0 0 44 44"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="26" height="26" rx="8" transform="rotate(-8 17 17)" fill={token.colorText} />
                  <rect x="16" y="16" width="22" height="22" rx="7" transform="rotate(14 27 27)" fill={token.colorPrimary} />
                </svg>
                <Title
                  level={3}
                  style={{
                    margin: 0,
                    fontWeight: token.fontWeightStrong,
                    color: token.colorText,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Sign in to your account
                </Title>
                <Text style={{ color: token.colorTextSecondary }}>
                  Enter your credentials to access the workspace
                </Text>
              </Flex>

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
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[{ required: true, message: 'Please enter your password' }]}
                >
                  <Input.Password size="large" placeholder="••••••••" />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={isLoading}>
                  Sign In
                </Button>
                <Flex justify="center" style={{ marginTop: token.marginSM }}>
                  <Link to="/forgot-password" style={{ color: token.colorTextSecondary }}>
                    Forgot password?
                  </Link>
                </Flex>
              </Form>

              <Flex justify="center">
                <Text style={{ color: token.colorTextSecondary }}>
                  Setting up a new organization?{' '}
                  <Link to="/register-org" style={{ color: token.colorPrimary, fontWeight: token.fontWeightStrong }}>
                    Register here
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