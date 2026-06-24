import React, { useState, useEffect, useRef } from 'react';
import { Button, Flex, Typography, Spin } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import apiClient from '../config/axios';

const { Text, Paragraph } = Typography;

const handleDownload = async (url, filename) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    window.open(url, '_blank');
  }
};

export default function AudioAttachment({ file }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [status, setStatus] = useState(file.transcription_status || '');
  const [text, setText] = useState(file.transcription_text || '');
  const pollRef = useRef(null);

  const isPolling = status === 'PENDING' || status === 'PROCESSING';

  useEffect(() => {
    setStatus(file.transcription_status || '');
    setText(file.transcription_text || '');
  }, [file.transcription_status, file.transcription_text]);

  useEffect(() => {
    if (!isPolling || !showTranscript || !file.id) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(`/attachments/${file.id}/transcription`);
        const t = res.data;
        setStatus(t.status);
        if (t.status === 'COMPLETED') {
          setText(t.transcript_text);
          clearInterval(pollRef.current);
        } else if (t.status === 'FAILED') {
          clearInterval(pollRef.current);
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 5000);

    return () => clearInterval(pollRef.current);
  }, [isPolling, showTranscript, file.id]);

  return (
    <div>
      <Flex gap="small" align="center">
        <audio controls src={file.file_url} style={{ height: 30 }} />
        <Button icon={<DownloadOutlined />} size="small" type="text" onClick={() => handleDownload(file.file_url, file.file_name)} />
        {status && (
          <Button
            icon={<FileTextOutlined />}
            size="small"
            type="text"
            onClick={() => setShowTranscript(prev => !prev)}
          >
            {showTranscript ? 'Hide' : 'Transcript'}
          </Button>
        )}
      </Flex>
      {showTranscript && (
        <div style={{ marginTop: 6, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, maxWidth: 500 }}>
          {status === 'COMPLETED' && <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</Paragraph>}
          {(status === 'PENDING' || status === 'PROCESSING') && (
            <Flex gap="small" align="center">
              <Spin size="small" />
              <Text type="secondary">Transcribing...</Text>
            </Flex>
          )}
          {status === 'FAILED' && <Text type="danger">Transcription failed</Text>}
        </div>
      )}
    </div>
  );
}
