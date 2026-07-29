// src/features/auth/pages/LoginPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { App, Button, Divider, Flex, Form, Input, List, Typography, theme } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { authAPI } from '../api';
import PixelBlast from '../../../components/ui/PixelBlast';
import Logo from '../../../components/Logo';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const googleButtonRef = useRef(null);

  // Set only when a login attempt succeeds but the account belongs to more
  // than one org — the FE has to ask which org before a real session exists.
  const [orgPicker, setOrgPicker] = useState(null); // { pendingToken, orgs }

  const finishLogin = async () => {
    await login();
    message.success('Welcome back!');
    navigate('/dashboard');
  };

  const handleSelectOrg = async (orgId) => {
    try {
      setIsLoading(true);
      await authAPI.selectOrg(orgPicker.pendingToken, orgId);
      await finishLogin();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to select organization');
    } finally {
      setIsLoading(false);
    }
  };

  const runtimeGoogleId = window.RUNTIME_CONFIG?.REACT_APP_GOOGLE_CLIENT_ID;
  const googleClientId =
    (runtimeGoogleId && runtimeGoogleId !== '${REACT_APP_GOOGLE_CLIENT_ID}' ? runtimeGoogleId : null) ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID ||
    null;

  const onFinish = async (values) => {
    try {
      setIsLoading(true);
      const result = await authAPI.login(values);
      if (result.requires_org_selection) {
        setOrgPicker({ pendingToken: result.pending_token, orgs: result.orgs });
        return;
      }
      // 2. WAIT for the AuthContext to fetch the user profile via /me
      await finishLogin();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  const onGoogleCredential = async (response) => {
    try {
      setIsLoading(true);
      const result = await authAPI.googleLogin(response.credential);
      if (result.requires_org_selection) {
        setOrgPicker({ pendingToken: result.pending_token, orgs: result.orgs });
        return;
      }
      await finishLogin();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  // Google Identity Services loads its script async (see public/index.html),
  // so poll briefly until window.google is available before rendering the button.
  useEffect(() => {
    const clientId = googleClientId;
    if (!clientId) return undefined;

    let cancelled = false;
    let pollInterval;
    let resizeTimer;

    // Google's button takes a fixed pixel width, so we cap it to the
    // container's actual width to avoid overflowing narrow screens.
    const getButtonWidth = () => {
      const container = googleButtonRef.current?.parentElement;
      if (!container) return 392;
      return Math.min(392, Math.floor(container.getBoundingClientRect().width));
    };

    const renderButton = () => {
      if (cancelled || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: onGoogleCredential,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: getButtonWidth(),
      });
    };

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderButton, 150);
    };

    if (window.google?.accounts?.id) {
      renderButton();
    } else {
      pollInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(pollInterval);
          renderButton();
        }
      }, 100);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        @media (max-width: 400px) {
          .login-form-panel {
            padding: 24px 16px;
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
                <Logo size={44} />
                <Title
                  level={3}
                  style={{
                    margin: 0,
                    fontWeight: token.fontWeightStrong,
                    color: token.colorText,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {orgPicker ? 'Choose an organization' : 'Sign in to your account'}
                </Title>
                <Text style={{ color: token.colorTextSecondary }}>
                  {orgPicker
                    ? 'Your account belongs to more than one organization.'
                    : 'Enter your credentials to access the workspace'}
                </Text>
              </Flex>

              {orgPicker ? (
                <List
                  dataSource={orgPicker.orgs}
                  renderItem={(org) => (
                    <List.Item
                      style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: token.borderRadiusLG }}
                      onClick={() => !isLoading && handleSelectOrg(org.org_id)}
                    >
                      <Flex align="center" gap="middle" style={{ width: '100%' }}>
                        <ApartmentOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                        <Flex vertical style={{ flex: 1 }}>
                          <Text strong>{org.org_name}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {(org.roles || []).join(', ').replace(/_/g, ' ')}
                          </Text>
                        </Flex>
                      </Flex>
                    </List.Item>
                  )}
                />
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

                  {googleClientId && (
                    <>
                      <Divider style={{ margin: 0, color: token.colorTextSecondary }}>or</Divider>
                      <Flex justify="center">
                        <div ref={googleButtonRef} />
                      </Flex>
                    </>
                  )}
                </>
              )}

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