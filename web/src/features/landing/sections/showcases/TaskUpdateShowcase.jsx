import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from 'antd';
import {
  PlayCircleOutlined, FileTextOutlined, FilePdfOutlined,
  DownloadOutlined, CommentOutlined, LoadingOutlined, CheckOutlined,
} from '@ant-design/icons';
import { Avatar } from '../../../../components/TaskDrawerShared';
import ShowcaseFrame from './ShowcaseFrame';
import './Showcases.css';

// Mirrors the real task drawer: header title + Reject/Approve (exact colors
// from TeamTasksPage.jsx), a voice-note attachment with the same play/track/
// transcript pattern as AudioAttachment.jsx, a file attachment chip, and the
// comments toggle from TaskDrawerShared's CommentsSection — all seeded static
// data, cycling through a phase timeline so each real interaction gets shown.
const PHASE_DURATIONS = [1000, 1300, 1700, 1900, 1300];
const TRANSCRIPT_TEXT = 'Addressed the feedback from the last sync, ready for another pass.';

function useShowcasePhases() {
  const [phase, setPhase] = useState(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setPhase((p) => (p + 1) % PHASE_DURATIONS.length);
    }, PHASE_DURATIONS[phase]);
    return () => clearTimeout(timeoutRef.current);
  }, [phase]);

  return phase;
}

export default function TaskUpdateShowcase() {
  const phase = useShowcasePhases();

  const transcribing = phase === 1;
  const transcribed = phase >= 2;
  const commentsOpen = phase === 3;
  const approving = phase === 4;

  return (
    <ShowcaseFrame path="abhiyan.app/tasks/onboarding-redesign">
      <div className="sc-drawer-header">
        <span className="sc-task-title" style={{ marginBottom: 0 }}>Redesign onboarding flow</span>
        <div className="sc-drawer-actions">
          <Button size="small" style={{ background: 'transparent', border: '1px solid #B3455C', color: '#B3455C' }}>
            Reject
          </Button>
          <motion.div
            animate={approving ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <Button size="small" style={{ backgroundColor: '#B3455C', border: 'none', color: '#FFFFFF' }}>
              {approving ? <><CheckOutlined /> Approved</> : 'Approve'}
            </Button>
          </motion.div>
        </div>
      </div>

      <div className="sc-task-updates">
        <div className="sc-update-row">
          <Avatar firstName="Priya" lastName="Shah" size={30} />
          <div className="sc-update-body">
            <div className="sc-update-head">
              <span className="sc-update-name">Priya Shah</span>
              <span className="sc-update-time">2h ago</span>
            </div>
            <p className="sc-update-text">Uploaded the walkthrough voice note.</p>

            <div className="sc-voice-chip">
              <button className="sc-voice-play" type="button"><PlayCircleOutlined style={{ fontSize: 12 }} /></button>
              <div className="sc-voice-track"><div className="sc-voice-progress" /></div>
              <span className="sc-voice-duration">0:38</span>
              <FileTextOutlined style={{ fontSize: 12, color: 'rgba(24,24,27,0.4)' }} />
            </div>

            <AnimatePresence>
              {(transcribing || transcribed) && (
                <motion.div
                  className="sc-transcript-box"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {transcribing ? (
                    <span className="sc-transcript-loading"><LoadingOutlined spin /> Transcribing…</span>
                  ) : (
                    <span>{TRANSCRIPT_TEXT}</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="sc-update-row">
          <Avatar firstName="Marcus" lastName="Webb" size={30} />
          <div className="sc-update-body">
            <div className="sc-update-head">
              <span className="sc-update-name">Marcus Webb</span>
              <span className="sc-update-time">45m ago</span>
            </div>
            <p className="sc-update-text">Left a note and the updated spec.</p>

            <div className="sc-update-file">
              <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
              spec-v2.pdf
              <DownloadOutlined style={{ fontSize: 10, color: 'rgba(24,24,27,0.4)' }} />
            </div>

            <button className="sc-comments-toggle" type="button">
              <CommentOutlined style={{ fontSize: 11 }} />
              2 comments
              <span style={{ fontSize: 10, opacity: 0.6 }}>{commentsOpen ? '▲' : '▼'}</span>
            </button>

            <AnimatePresence>
              {commentsOpen && (
                <motion.div
                  className="sc-comments-thread"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Avatar firstName="Priya" lastName="Shah" size={22} />
                  <div>
                    <span className="sc-comments-thread-name">Priya Shah</span>
                    <span className="sc-comments-thread-time">2m</span>
                    <p className="sc-comments-thread-text">Sounds good, I&apos;ll merge once QA signs off.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </ShowcaseFrame>
  );
}
