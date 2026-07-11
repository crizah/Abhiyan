import React, { useState, useRef, useEffect } from 'react';
import { Button, Space, Typography, Badge, message } from 'antd';
import { 
  AudioOutlined, 
  DeleteOutlined, 
  SendOutlined, 
  StopOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined 
} from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/S3Upload';
import { getMicErrorMessage } from '../utils/micAccess';

const { Text } = Typography;

export const AudioRecorder = ({ onUploadSuccess }) => {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null); // FIX 1: Safely store the URL
  const [uploading, setUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); 
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null); 
  const audioPlayerRef = useRef(null);

  // Cleanup to prevent memory leaks when destroying the blob URL
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    setAudioBlob(null); 
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        // FIX 2: Let the browser use its native format to prevent Safari/iOS failures
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        setAudioBlob(blob);
        setAudioUrl(url); // Set it once, so React doesn't regenerate it on every click
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
      message.error(getMicErrorMessage(err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleDiscard = () => {
    setAudioBlob(null); 
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);
    audioChunksRef.current = [];
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    setUploading(true);
    
    // Ensure the file extension matches what the browser actually recorded
    const extension = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const voiceFile = new File([audioBlob], `voice-note-${Date.now()}.${extension}`, { type: audioBlob.type });
    
    try {
      const s3Data = await uploadFileToS3(voiceFile, 'uploads');
      onUploadSuccess({
        uid: s3Data.file_url,
        name: s3Data.file_name,
        status: 'done',
        url: s3Data.file_url,
        s3Data: s3Data
      });
      handleDiscard(); // Wipe everything clean on success
    } catch (err) {
      message.error("Failed to upload voice note.");
    } finally {
      setUploading(false);
    }
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;
    
    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      audioPlayerRef.current.play().catch(e => console.error("Playback error:", e));
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <Space style={{ padding: '4px 0' }}>
      {!audioUrl ? (
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
        <Space align="center" style={{ background: '#f5f5f5', padding: '8px 12px', borderRadius: '32px' }}>
          
          <audio 
            ref={audioPlayerRef}
            src={audioUrl} // FIX 3: Using the stable URL from state
            onEnded={() => setIsPlaying(false)} 
          />

          <Button 
            type="primary" 
            shape="circle" 
            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />} 
            onClick={togglePlayback}
          />
          
          <Text style={{ margin: '0 8px', color: '#555' }}>Voice Note Recorded</Text>

          <Button 
            type="text"
            danger 
            icon={<DeleteOutlined />} 
            onClick={handleDiscard} 
            disabled={uploading}
            title="Discard"
          />
          <Button 
            type="primary" 
            shape="round"
            icon={<SendOutlined />} 
            onClick={handleSend} 
            loading={uploading}
          >
            {uploading ? 'Sending' : 'Send'}
          </Button>
        </Space>
      )}
      {recording && <Badge status="processing" text={<Text type="danger">Recording Live...</Text>} />}
    </Space>
  );
};