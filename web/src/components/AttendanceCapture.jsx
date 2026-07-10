import React, { useState, useEffect, useRef } from 'react';
import { App, Modal, Flex, Typography, Spin, Button, theme } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { attendanceAPI } from '../features/auth/api';
import FaceCapture from './FaceCapture';

const { Text, Title } = Typography;

export default function AttendanceCapture() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const [modalOpen, setModalOpen] = useState(false);
  // screen: 'capture' | 'submitting' | 'matched' | 'unmatched'
  const [screen, setScreen] = useState('capture');

  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user?.attendance_enabled || !user?.face_registered) return;

    attendanceAPI.getToday().then((res) => {
      if (res.status === 'none' || res.status === 'unmatched') {
        setScreen('capture');
        setModalOpen(true);
      }
    }).catch(() => {});
  }, [user]);

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { clearInterval(pollRef.current); return; }
      try {
        const res = await attendanceAPI.getToday();
        if (res.status === 'pending') return;
        clearInterval(pollRef.current);
        if (!mountedRef.current) return;
        setScreen(res.status === 'matched' ? 'matched' : 'unmatched');
      } catch {}
    }, 2000);
  };

  const handleFaceCaptured = async ({ object_key }) => {
    setScreen('submitting');
    try {
      await attendanceAPI.markAttendance(object_key);
      startPolling();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to mark attendance.');
      setScreen('capture');
    }
  };

  const handleRetry = () => {
    clearInterval(pollRef.current);
    setScreen('capture');
  };

  if (!user?.attendance_enabled || !user?.face_registered) return null;

  return (
    <Modal
      open={modalOpen}
      title="Mark Attendance"
      footer={null}
      closable={false}
      centered
      width={420}
      destroyOnClose={false}
    >
      {screen === 'capture' && (
        <Flex vertical gap={token.marginMD} align="center" style={{ paddingTop: 8, paddingBottom: 8 }}>
          <Text type="secondary" style={{ textAlign: 'center', maxWidth: 340 }}>
            Take a photo to mark your attendance for today.
          </Text>
          <FaceCapture
            onCapture={handleFaceCaptured}
            folderType="targets"
          />
        </Flex>
      )}

      {screen === 'submitting' && (
        <Flex vertical align="center" gap={token.marginMD} style={{ padding: '40px 0' }}>
          <Spin size="large" />
          <Text type="secondary">Verifying your identity…</Text>
        </Flex>
      )}

      {screen === 'matched' && (
        <Flex vertical align="center" gap={token.marginMD} style={{ padding: '32px 0' }}>
          <CheckCircleFilled style={{ fontSize: 56, color: token.colorSuccess }} />
          <Title level={4} style={{ margin: 0 }}>Attendance Marked!</Title>
          <Text type="secondary">You're marked present for today.</Text>
          <Button type="primary" onClick={() => setModalOpen(false)}>
            Continue
          </Button>
        </Flex>
      )}

      {screen === 'unmatched' && (
        <Flex vertical align="center" gap={token.marginMD} style={{ padding: '32px 0' }}>
          <CloseCircleFilled style={{ fontSize: 56, color: token.colorError }} />
          <Title level={4} style={{ margin: 0 }}>Face Didn't Match</Title>
          <Text type="secondary" style={{ textAlign: 'center', maxWidth: 300 }}>
            You've been marked absent for today. You can try again if you'd like.
          </Text>
          <Flex gap={token.marginSM}>
            <Button onClick={() => setModalOpen(false)}>Dismiss</Button>
            <Button type="primary" icon={<ReloadOutlined />} onClick={handleRetry}>
              Try Again
            </Button>
          </Flex>
        </Flex>
      )}
    </Modal>
  );
}
