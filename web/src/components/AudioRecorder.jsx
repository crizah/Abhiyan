import React, { useState, useRef } from 'react';
import { Button, Space, Typography, Badge, message } from 'antd';
import { AudioOutlined, DeleteOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/S3Upload';

const { Text } = Typography;

export const AudioRecorder = ({ onUploadSuccess }) => {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null); // Stores the finished audio for review
  const [uploading, setUploading] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null); 

  const startRecording = async () => {
    audioChunksRef.current = [];
    setAudioBlob(null); 

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        // Create the audio file but DO NOT upload it yet. Save it to state for review.
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        
        // Kill the microphone light/stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
      message.error("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleDiscard = () => {
    setAudioBlob(null); // Trashes the recording and returns to the initial state
    audioChunksRef.current = [];
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    setUploading(true);
    
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
      setAudioBlob(null); 
    } catch (err) {
      message.error("Failed to upload voice note.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Space style={{ padding: '4px 0' }}>
      {!audioBlob ? (
        /* STATE 1: Ready to Record or Actively Recording */
        recording ? (
          <Button type="primary" danger icon={<StopOutlined />} onClick={stopRecording}>
            Stop Recording
          </Button>
        ) : (
          <Button type="default" icon={<AudioOutlined />} onClick={startRecording}>
            Record Voice Memo
          </Button>
        )
      ) : (
        /* STATE 2: Review UI (Listen back, Discard, or Send) */
        <Space align="center" style={{ background: '#f5f5f5', padding: '8px', borderRadius: '8px' }}>
          <audio 
            src={URL.createObjectURL(audioBlob)} 
            controls 
            style={{ height: '40px', width: '250px' }} 
          />
          <Button 
            danger 
            icon={<DeleteOutlined />} 
            onClick={handleDiscard} 
            disabled={uploading}
            title="Discard Voice Note"
          />
          <Button 
            type="primary" 
            icon={<SendOutlined />} 
            onClick={handleSend} 
            loading={uploading}
          >
            {uploading ? 'Sending...' : 'Send'}
          </Button>
        </Space>
      )}
      {recording && <Badge status="processing" text={<Text type="danger">Recording Live...</Text>} />}
    </Space>
  );
};