import React, { useState, useRef } from 'react';
import { Button, Space, Typography, Badge } from 'antd';
import { AudioOutlined, AudioMutedOutlined, LoadingOutlined } from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/S3Upload';

const { Text } = Typography;

export const AudioRecorder = ({ onUploadSuccess }) => {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setUploading(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const voiceFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        
        try {
          const s3Data = await uploadFileToS3(voiceFile);
          onUploadSuccess({
            uid: s3Data.file_url,
            name: s3Data.file_name,
            status: 'done',
            url: s3Data.file_url,
            s3Data: s3Data
          });
        } catch (err) {
          // Error alert handled inside uploader module
        } finally {
          setUploading(false);
          // Terminate active microphone streams
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return (
    <Space style={{ padding: '4px 0' }}>
      {recording ? (
        <Button type="primary" danger icon={<AudioMutedOutlined />} onClick={stopRecording}>
          Stop & Save Note
        </Button>
      ) : (
        <Button type="default" icon={<AudioOutlined />} onClick={startRecording} loading={uploading}>
          {uploading ? 'Processing Voice...' : 'Record Voice Memo'}
        </Button>
      )}
      {recording && <Badge status="processing" text={<Text type="danger">Recording Live...</Text>} />}
    </Space>
  );
};