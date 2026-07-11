import React, { useState, useEffect, useRef } from 'react';
import { Button, Flex, Typography, Spin } from 'antd';
import { DownloadOutlined, FileTextOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
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

function formatTime(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioAttachment({ file }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [status, setStatus] = useState(file.transcription_status || '');
  const [text, setText] = useState(file.transcription_text || '');
  const pollRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const trackRef = useRef(null);

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

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
    setPlaying(p => !p);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !trackRef.current || !duration) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  };

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#fff', border: '1px solid rgba(179, 69, 92, 0.35)',
        borderRadius: 20, padding: '4px 10px 4px 4px', minWidth: 220,
      }}>
        <audio
          ref={audioRef}
          src={file.playback_url || file.file_url}
          onEnded={() => { setPlaying(false); setCurrentTime(0); }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={togglePlay}
          style={{
            width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: '#B3455C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {playing ? <PauseCircleOutlined style={{ fontSize: 13 }} /> : <PlayCircleOutlined style={{ fontSize: 13 }} />}
        </button>

        <div
          ref={trackRef}
          onClick={handleSeek}
          style={{ flex: 1, height: 4, background: 'rgba(24, 24, 27, 0.1)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
        >
          <div style={{ position: 'absolute', inset: 0, width: `${progressPct}%`, background: '#B3455C', borderRadius: 2 }} />
        </div>

        <Text style={{ fontSize: 11, color: '#18181B', minWidth: 34, textAlign: 'right' }}>
          {formatTime(playing || currentTime ? currentTime : duration)}
        </Text>

        <Button
          icon={<DownloadOutlined />}
          size="small"
          type="text"
          onClick={() => handleDownload(file.file_url, file.file_name)}
          style={{ color: 'rgba(24,24,27,0.45)' }}
        />
        {status && (
          <Button
            icon={<FileTextOutlined />}
            size="small"
            type="text"
            onClick={() => setShowTranscript(prev => !prev)}
            style={{ color: 'rgba(24,24,27,0.45)' }}
          />
        )}
      </div>
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
