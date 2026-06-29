import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Flex, Typography, Spin, theme } from 'antd';
import { CameraOutlined, ReloadOutlined, CheckOutlined, WarningOutlined } from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/S3Upload';
import { uploadAPI } from '../features/auth/api';

const { Text } = Typography;

const VALIDATION_REASONS = {
  no_face_detected: 'No face was detected. Make sure your face is clearly visible.',
  low_brightness: 'Photo is too dark. Move to a brighter area and try again.',
  low_sharpness: 'Photo is blurry. Hold still and try again.',
  low_confidence: 'Could not verify your face clearly. Please try again.',
  detection_error: 'Verification failed. Please try again.',
  download_error: 'Could not process the photo. Please try again.',
};

/**
 * Webcam capture component.
 * Props:
 *   onCapture({ file_url, object_key }) — called after upload (and validation if enabled)
 *   folderType — S3 prefix: 'sources' (default) or 'targets'
 *   skipValidation — skip Rekognition quality check (default false)
 */
export default function FaceCapture({ onCapture, folderType = 'sources', skipValidation = false }) {
  const [status, setStatus] = useState('idle'); // idle | captured | uploading | validating
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const { token } = theme.useToken();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(pollRef.current);
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('Camera access denied. Please allow camera access and try again.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // Mirror canvas to match mirrored video preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.9));
        setCapturedBlob(blob);
        setStatus('captured');
        setValidationError(null);
        stopCamera();
      },
      'image/jpeg',
      0.9,
    );
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setCapturedBlob(null);
    setValidationError(null);
    setStatus('idle');
    startCamera();
  };

  const handleUsePhoto = async () => {
    if (!capturedBlob) return;
    setStatus('uploading');
    setValidationError(null);

    let s3Data;
    try {
      const file = new File([capturedBlob], `face-${Date.now()}.jpg`, { type: 'image/jpeg' });
      s3Data = await uploadFileToS3(file, folderType);
    } catch {
      setStatus('captured');
      return;
    }

    // Skip validation (e.g. for attendance captures) — call onCapture directly
    if (skipValidation) {
      onCapture({ file_url: s3Data.file_url, object_key: s3Data.object_key });
      return;
    }

    // Enqueue quality validation job
    let jobId;
    try {
      const res = await uploadAPI.validateFace(s3Data.object_key);
      jobId = res.job_id;
    } catch {
      setStatus('captured');
      return;
    }

    setStatus('validating');

    // Poll every 2s for the result
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        clearInterval(pollRef.current);
        return;
      }

      try {
        const result = await uploadAPI.getValidationStatus(jobId);

        if (result.status === 'pending') return;

        clearInterval(pollRef.current);

        if (!mountedRef.current) return;

        if (result.status === 'valid') {
          onCapture({ file_url: s3Data.file_url, object_key: s3Data.object_key });
        } else {
          // Clean up the rejected S3 object and prompt retake
          try {
            await uploadAPI.deleteS3Object(s3Data.file_url);
          } catch {
            // best-effort cleanup
          }
          setValidationError(VALIDATION_REASONS[result.reason] ?? VALIDATION_REASONS.detection_error);
          setCapturedDataUrl(null);
          setCapturedBlob(null);
          setStatus('idle');
          startCamera();
        }
      } catch {
        // Transient network error — keep polling
      }
    }, 2000);
  };

  const guidanceText = {
    idle: validationError
      ? null
      : 'Look directly at the camera in a well-lit area with no obstructions.',
    captured: 'Check that your face is clear and well-lit. Retake if needed.',
    uploading: 'Uploading your photo…',
    validating: 'Verifying photo quality…',
  }[status];

  const isBusy = status === 'uploading' || status === 'validating';

  return (
    <Flex vertical gap={token.marginMD} align="center">
      <div
        style={{
          position: 'relative',
          width: 320,
          height: 240,
          borderRadius: token.borderRadiusLG,
          overflow: 'hidden',
          background: token.colorFillQuaternary,
          border: `1px solid ${token.colorBorder}`,
        }}
      >
        {/* Live camera feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            display: status === 'idle' ? 'block' : 'none',
          }}
        />

        {/* Captured still preview */}
        {capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Captured face"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {/* Face-outline guide over live feed */}
        {status === 'idle' && !cameraError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 110,
                height: 150,
                border: `2px dashed ${token.colorPrimary}`,
                borderRadius: '50%',
                opacity: 0.75,
              }}
            />
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <Flex
            vertical
            justify="center"
            align="center"
            gap={8}
            style={{
              position: 'absolute',
              inset: 0,
              padding: 16,
              textAlign: 'center',
              background: token.colorBgLayout,
            }}
          >
            <WarningOutlined style={{ fontSize: 24, color: token.colorError }} />
            <Text type="danger" style={{ fontSize: 13 }}>
              {cameraError}
            </Text>
          </Flex>
        )}

        {/* Uploading / validating overlay */}
        {isBusy && (
          <Flex
            vertical
            justify="center"
            align="center"
            gap={8}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
          >
            <Spin size="large" />
            <Text style={{ color: '#fff', fontSize: 13 }}>
              {status === 'uploading' ? 'Uploading…' : 'Verifying…'}
            </Text>
          </Flex>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Validation error banner */}
      {validationError && (
        <Flex align="center" gap={6}>
          <WarningOutlined style={{ color: token.colorError }} />
          <Text type="danger" style={{ fontSize: 13 }}>
            {validationError}
          </Text>
        </Flex>
      )}

      {guidanceText && (
        <Text type="secondary" style={{ textAlign: 'center', maxWidth: 300, fontSize: 13 }}>
          {guidanceText}
        </Text>
      )}

      <Flex gap={token.marginSM}>
        {status === 'idle' && (
          <Button
            type="primary"
            size="large"
            icon={<CameraOutlined />}
            onClick={handleCapture}
            disabled={!!cameraError}
          >
            Take Photo
          </Button>
        )}

        {status === 'captured' && (
          <>
            <Button size="large" icon={<ReloadOutlined />} onClick={handleRetake}>
              Retake
            </Button>
            <Button type="primary" size="large" icon={<CheckOutlined />} onClick={handleUsePhoto}>
              Use this Photo
            </Button>
          </>
        )}
      </Flex>
    </Flex>
  );
}
