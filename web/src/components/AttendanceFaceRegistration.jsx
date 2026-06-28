import React, { useState } from 'react';
import { Alert, Button, Flex, Modal, Typography, theme } from 'antd';
import { CameraOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { attendanceAPI } from '../features/auth/api';
import FaceCapture from './FaceCapture';

const { Text } = Typography;

/**
 * Renders a dismissable banner when attendance is enabled for the org
 * but the current user has not yet registered their face.
 * Shown inside AppLayout so it appears on every page until resolved.
 */
export default function AttendanceFaceRegistration() {
  const { user, login } = useAuth();
  const { token } = theme.useToken();

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(false);

  const shouldShow = user?.attendance_enabled && !user?.face_registered;
  if (!shouldShow) return null;

  const handleFaceCaptured = async (facePayload) => {
    setSaving(true);
    try {
      await attendanceAPI.registerFace(facePayload);
      setRegistered(true);
      // Keep modal open for 2s so the success screen is visible, then refresh user
      setTimeout(async () => {
        await login();
        setModalOpen(false);
        setRegistered(false);
      }, 2000);
    } catch {
      // error is surfaced by the API layer
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{
          marginBottom: 16,
          borderRadius: token.borderRadius,
        }}
        message="Face Registration Required"
        description="Attendance tracking is enabled for your organization. Please register your face so your attendance can be verified."
        action={
          <Button
            type="primary"
            size="small"
            icon={<CameraOutlined />}
            onClick={() => setModalOpen(true)}
          >
            Register Now
          </Button>
        }
      />

      <Modal
        open={modalOpen}
        title="Register Your Face"
        footer={null}
        onCancel={() => setModalOpen(false)}
        centered
        width={420}
        destroyOnClose
      >
        {registered ? (
          <Flex vertical align="center" gap={token.marginMD} style={{ padding: '32px 0' }}>
            <CheckCircleFilled style={{ fontSize: 56, color: token.colorSuccess }} />
            <Typography.Title level={4} style={{ margin: 0 }}>
              Face Registered!
            </Typography.Title>
            <Text type="secondary">Your attendance will now be tracked automatically.</Text>
          </Flex>
        ) : (
          <Flex vertical gap={token.marginMD} align="center" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <Text type="secondary" style={{ textAlign: 'center', maxWidth: 340 }}>
              Your photo is used only for attendance verification. Ensure you are in a well-lit
              area with no obstructions.
            </Text>

            <FaceCapture onCapture={handleFaceCaptured} />

            {saving && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Saving your registration…
              </Text>
            )}
          </Flex>
        )}
      </Modal>
    </>
  );
}
