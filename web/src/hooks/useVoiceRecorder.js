import { useState, useRef, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { uploadFileToS3 } from '../utils/S3Upload';
import { getMicErrorMessage } from '../utils/micAccess';

// Stages a recorded voice note into the caller's fileList the same way a regular
// file attachment stages: `onStaged(file, 'add')` immediately with status 'uploading'
// (so the composer can render a chip right away), then 'update' once the S3 upload
// resolves with status 'done' + s3Data attached (what the existing submit filters key off).
export function useVoiceRecorder(onStaged) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const elapsedRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = useCallback(async () => {
    chunksRef.current = [];
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        const duration = elapsedRef.current;
        elapsedRef.current = 0;
        setElapsed(0);
        if (cancelledRef.current) return;

        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const voiceFile = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mimeType });
        const localUrl = URL.createObjectURL(blob);
        const uid = `voice-${Date.now()}`;

        onStaged({ uid, name: voiceFile.name, status: 'uploading', url: localUrl, isVoiceNote: true, duration }, 'add');

        try {
          const s3Data = await uploadFileToS3(voiceFile, 'uploads');
          onStaged({ uid, name: s3Data.file_name, status: 'done', url: localUrl, s3Data, isVoiceNote: true, duration }, 'update');
        } catch {
          message.error('Failed to upload voice note.');
          onStaged({ uid }, 'remove');
        }
      };

      recorder.start();
      setRecording(true);
      elapsedRef.current = 0;
      setElapsed(0);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
    } catch (err) {
      message.error(getMicErrorMessage(err));
    }
  }, [onStaged]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && recording) mediaRecorderRef.current.stop();
  }, [recording]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current && recording) mediaRecorderRef.current.stop();
  }, [recording]);

  return { recording, elapsed, start, stop, cancel };
}
