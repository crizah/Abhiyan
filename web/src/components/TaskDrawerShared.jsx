import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Typography, Button, Flex, Popover, Mentions, Upload, Tag, Card, Divider } from 'antd';
import { CommentOutlined, SendOutlined, DownloadOutlined, PlusOutlined, AudioOutlined, CheckOutlined, DeleteOutlined, LoadingOutlined, PlayCircleOutlined, PauseCircleOutlined, FilePdfOutlined, FileOutlined, SoundOutlined, FileImageOutlined, InfoCircleOutlined, CheckCircleOutlined, CloseOutlined, CalendarOutlined } from '@ant-design/icons';
import AudioAttachment from './AudioAttachment';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { fulfillmentColor, taskStatusColor, reviewStatusColor, roleColor } from '../utils/taskColors';
import dayjs from 'dayjs';

const { Text, Paragraph, Title } = Typography;

const AVATAR_COLORS = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#52c41a', '#eb2f96', '#1677ff'];

export function getAvatarColor(name) {
  return AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

export function getInitials(first, last) {
  return `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();
}

export function Avatar({ firstName, lastName, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: getAvatarColor(firstName),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.4, fontWeight: 600, flexShrink: 0,
      userSelect: 'none',
    }}>
      {getInitials(firstName, lastName)}
    </div>
  );
}

export function renderMentions(content) {
  if (!content) return null;
  return content.split(/(@\w+)/g).map((part, i) => {
    if (!part.startsWith('@')) return <span key={i}>{part}</span>;
    return (
      <Popover
        key={i}
        overlayInnerStyle={{ padding: 0, background: 'transparent', boxShadow: 'none' }}
        trigger="hover"
        content={
          <div style={{
            background: '#141414', color: '#fff', borderRadius: 8,
            padding: '8px 14px', minWidth: 100, fontSize: 13,
          }}>
            {part}
          </div>
        }
      >
        <span style={{ color: '#1677ff', fontWeight: 500, cursor: 'pointer' }}>{part}</span>
      </Popover>
    );
  });
}

const handleDownload = async (url, filename) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
};

// Approve/Reject/Reopen each log a system update with a distinct fixed prefix
// (see server/internal/services/tasks.go AddTaskUpdate calls) — detect those to
// color-code the feed's connecting line at that point in the timeline.
const STATUS_LINE_COLORS = { closed: '#52c41a', rejected: '#ff4d4f', reopened: '#722ed1' };

function detectUpdateKind(content) {
  if (!content) return null;
  if (content.startsWith('TASK REJECTED')) return 'rejected';
  if (content.startsWith('TASK REOPENED')) return 'reopened';
  if (content.startsWith('Task Approved')) return 'closed';
  return null;
}

function fileIcon(file) {
  const ext = file.file_name?.split('.').pop()?.toLowerCase();
  if (file.file_type?.startsWith('image/')) return <FileImageOutlined style={{ color: '#1677ff', fontSize: 16 }} />;
  if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
  return <FileOutlined style={{ color: '#8c8c8c', fontSize: 16 }} />;
}

export function AttachmentRow({ file, idx }) {
  if (file.file_type?.startsWith('audio/')) {
    return (
      <div key={idx} style={{
        background: '#fafafa', borderRadius: 10, padding: '8px 12px',
        border: '1px solid #f0f0f0',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <SoundOutlined style={{ color: '#8c8c8c', fontSize: 15 }} />
        <AudioAttachment file={file} />
      </div>
    );
  }
  if (file.file_type?.startsWith('image/')) {
    return (
      <div key={idx} style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        <img
          src={file.file_url}
          alt={file.file_name}
          style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8, objectFit: 'cover', display: 'block' }}
        />
        <Button
          icon={<DownloadOutlined />}
          size="small"
          type="link"
          onClick={() => handleDownload(file.file_url, file.file_name)}
          style={{ padding: 0, height: 'auto', alignSelf: 'flex-start', fontSize: 12 }}
        >
          Download
        </Button>
      </div>
    );
  }
  return (
    <div key={idx} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: '#fafafa', borderRadius: 8, padding: '6px 10px',
      border: '1px solid #ebebeb', maxWidth: '100%',
    }}>
      {fileIcon(file)}
      <a
        href={file.file_url}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={file.file_name}
      >
        {file.file_name}
      </a>
      <Button
        icon={<DownloadOutlined />}
        size="small"
        type="text"
        onClick={() => handleDownload(file.file_url, file.file_name)}
        style={{ flexShrink: 0 }}
      />
    </div>
  );
}

export function CommentsSection({
  update,
  commentsMap,
  commentOffsets,
  hasMoreComments,
  loadingComments,
  expandedComments,
  toggleComments,
  fetchComments,
  postComment,
  taskId,
  cachedMentionOptions,
  canPost,
  handleS3UploadWithPurge,
  deleteUnsavedS3File,
  lineColor = '#bfbfbf',
}) {
  const isExpanded = expandedComments[update.id];
  const comments = commentsMap[update.id] || [];
  const count = update.comment_count || 0;

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => toggleComments(update.id)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: isExpanded ? '#f5f5f5' : 'transparent',
          border: '1px solid #e8e8e8', borderRadius: 20,
          padding: '3px 10px', cursor: 'pointer',
          fontSize: 12, color: '#595959',
          transition: 'background 0.15s',
        }}
      >
        <CommentOutlined style={{ fontSize: 11 }} />
        {count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : 'Reply'}
        <span style={{ fontSize: 10, opacity: 0.6 }}>{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${lineColor}` }}>
          {loadingComments[update.id] && !comments.length && (
            <Text type="secondary" style={{ fontSize: 12 }}>Loading...</Text>
          )}

          {comments.map(c => (
            <div key={c.id} style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Avatar firstName={c.first_name} lastName={c.last_name} size={24} />
              <div style={{ flex: 1 }}>
                <Flex gap={6} align="baseline">
                  <Text strong style={{ fontSize: 14 }}>{c.first_name} {c.last_name}</Text>
                  <Text style={{ fontSize: 12, color: '#18181B' }}>{dayjs(c.created_at).format('MMM D, h:mm A')}</Text>
                </Flex>
                <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 1 }}>
                  {renderMentions(c.content)}
                </div>
                {c.attachments?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {c.attachments.map((file, idx) => <AttachmentRow key={idx} file={file} idx={idx} />)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {hasMoreComments[update.id] && (
            <button
              onClick={() => fetchComments(taskId, update.id, commentOffsets[update.id] || 0)}
              disabled={loadingComments[update.id]}
              style={{
                display: 'block', marginBottom: 8, fontSize: 12,
                color: '#1677ff', background: 'none', border: 'none',
                cursor: 'pointer', padding: '2px 0',
              }}
            >
              {loadingComments[update.id] ? 'Loading...' : '↓ Load more comments'}
            </button>
          )}

          {canPost && (
            <CommentInput
              updateId={update.id}
              onSubmit={postComment}
              mentionOptions={cachedMentionOptions}
              handleS3UploadWithPurge={handleS3UploadWithPurge}
              deleteUnsavedS3File={deleteUnsavedS3File}
            />
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function roundBtnStyle(compact, filled) {
  const size = compact ? 26 : 30;
  return {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, padding: 0,
    border: filled ? 'none' : '1px solid rgba(24, 24, 27, 0.15)',
    background: filled ? '#B3455C' : 'transparent',
    color: filled ? '#FFFFFF' : '#18181B',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function AttachmentChip({ file, onRemove }) {
  const isVoice = file.isVoiceNote;
  const isUploading = file.status === 'uploading';
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
    setPlaying(p => !p);
  };

  if (isVoice) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: '#fff', border: '1px solid rgba(179, 69, 92, 0.35)',
        borderRadius: 20, padding: '3px 10px 3px 3px',
      }}>
        <audio ref={audioRef} src={file.url} onEnded={() => setPlaying(false)} style={{ display: 'none' }} />
        <button
          type="button"
          onClick={togglePlay}
          disabled={isUploading}
          style={{
            width: 22, height: 22, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: '#B3455C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: isUploading ? 'default' : 'pointer', opacity: isUploading ? 0.5 : 1,
          }}
        >
          {isUploading ? <LoadingOutlined style={{ fontSize: 11 }} /> : playing ? <PauseCircleOutlined style={{ fontSize: 11 }} /> : <PlayCircleOutlined style={{ fontSize: 11 }} />}
        </button>
        <span style={{ fontSize: 11, color: '#18181B' }}>
          {isUploading ? 'Uploading voice note…' : `Voice note · ${formatDuration(file.duration || 0)}`}
        </span>
        <button type="button" onClick={onRemove} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(24,24,27,0.45)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: '#fff', border: '1px solid rgba(24,24,27,0.12)',
      borderRadius: 20, padding: '3px 10px',
    }}>
      {isUploading && <LoadingOutlined style={{ fontSize: 11, color: '#B3455C' }} />}
      <span style={{ fontSize: 11, color: '#18181B', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      <button type="button" onClick={onRemove} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(24,24,27,0.45)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
    </div>
  );
}

function RecordingBar({ elapsed, onCancel, onStop, compact }) {
  return (
    <Flex align="center" gap={compact ? 8 : 10}>
      <button type="button" onClick={onCancel} title="Discard" style={roundBtnStyle(compact, false)}>
        <DeleteOutlined style={{ fontSize: compact ? 12 : 13 }} />
      </button>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f', flexShrink: 0, animation: 'rec-pulse 1.1s ease-in-out infinite' }} />
      <Text style={{ fontSize: compact ? 12 : 13, color: '#18181B', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatDuration(elapsed)}</Text>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, height: compact ? 16 : 20, overflow: 'hidden' }}>
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} style={{
            width: 3, borderRadius: 2, background: 'rgba(179, 69, 92, 0.45)', flexShrink: 0,
            height: `${28 + Math.abs(Math.sin(i * 1.7 + elapsed)) * 65}%`,
            transition: 'height 0.2s ease',
          }} />
        ))}
      </div>
      <button type="button" onClick={onStop} title="Stop and attach" style={roundBtnStyle(compact, true)}>
        <CheckOutlined style={{ fontSize: compact ? 12 : 14 }} />
      </button>
    </Flex>
  );
}

// Chat-bot style composer shared by the update box and the comment reply box: a single
// rounded bubble with the text field on top and a plus/mic/send toolbar anchored at its
// bottom edge, mirroring familiar chat-input layouts. Recording swaps the bubble's contents
// for a live waveform/timer bar instead of opening a separate control.
function ChatComposer({
  value, onChange, onSend, placeholder, mentionOptions,
  fileList, setFileList, handleS3UploadWithPurge, deleteUnsavedS3File,
  compact = false,
}) {
  const onVoiceStaged = (file, action) => {
    setFileList(prev => {
      if (action === 'add') return [...prev, file];
      if (action === 'remove') return prev.filter(f => f.uid !== file.uid);
      return prev.map(f => (f.uid === file.uid ? { ...f, ...file } : f));
    });
  };
  const recorder = useVoiceRecorder(onVoiceStaged);

  const removeFile = (file) => {
    if (file.isVoiceNote && file.url) URL.revokeObjectURL(file.url);
    else deleteUnsavedS3File?.(file);
    setFileList(prev => prev.filter(f => f.uid !== file.uid));
  };

  const canSend = (value.trim() || fileList.length > 0) && !recorder.recording;

  return (
    <div style={{
      background: recorder.recording ? 'rgba(179, 69, 92, 0.12)' : 'rgba(255, 255, 255, 0.22)',
      backdropFilter: 'blur(2px)',                                                                                                       
      WebkitBackdropFilter: 'blur(2px)',                                                                                                 
      border: `1px solid ${recorder.recording ? 'rgba(179, 69, 92, 0.5)' : 'rgba(179, 69, 92, 0.35)'}`,   
      borderRadius: compact ? 18 : 22,
      padding: compact ? '8px 10px' : '10px 12px',
      transition: 'background 0.15s ease, border-color 0.15s ease',
    }}>
      {recorder.recording ? (
        <RecordingBar elapsed={recorder.elapsed} onCancel={recorder.cancel} onStop={recorder.stop} compact={compact} />
      ) : (
        <>
          {fileList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {fileList.map(f => <AttachmentChip key={f.uid} file={f} onRemove={() => removeFile(f)} />)}
            </div>
          )}
          <Mentions
            variant="borderless"
            autoSize={{ minRows: 1, maxRows: 5 }}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); onSend(); } }}
            options={mentionOptions}
            style={{ padding: 0, fontSize: compact ? 13 : 14 }}
          />
          <Flex justify="space-between" align="center" style={{ marginTop: 6 }}>
            <Upload
              customRequest={(opt) => handleS3UploadWithPurge(opt, setFileList)}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
              showUploadList={false}
              multiple
            >
              <button type="button" title="Attach file" style={roundBtnStyle(compact, false)}>
                <PlusOutlined style={{ fontSize: compact ? 13 : 15 }} />
              </button>
            </Upload>
            <Flex gap={6}>
              <button type="button" title="Record voice note" onClick={recorder.start} style={roundBtnStyle(compact, false)}>
                <AudioOutlined style={{ fontSize: compact ? 13 : 15 }} />
              </button>
              <button
                type="button"
                title="Send"
                onClick={onSend}
                disabled={!canSend}
                style={{ ...roundBtnStyle(compact, true), opacity: canSend ? 1 : 0.4, cursor: canSend ? 'pointer' : 'default' }}
              >
                <SendOutlined style={{ fontSize: compact ? 13 : 15 }} />
              </button>
            </Flex>
          </Flex>
        </>
      )}
      <style>{`
        @keyframes rec-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

function CommentInput({ updateId, onSubmit, mentionOptions, handleS3UploadWithPurge, deleteUnsavedS3File }) {
  const [text, setText] = useState('');
  const [fileList, setFileList] = useState([]);

  const handleSubmit = () => {
    if (!text.trim() && fileList.length === 0) return;
    const attachments = fileList.filter(f => f.status === 'done' && f.s3Data).map(f => f.s3Data);
    onSubmit(updateId, text, attachments);
    setText('');
    setFileList([]);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <ChatComposer
        value={text}
        onChange={setText}
        onSend={handleSubmit}
        placeholder="Write a comment… use @ to mention"
        mentionOptions={mentionOptions}
        fileList={fileList}
        setFileList={setFileList}
        handleS3UploadWithPurge={handleS3UploadWithPurge}
        deleteUnsavedS3File={deleteUnsavedS3File}
        compact
      />
    </div>
  );
}

export function UpdateFeed({
  taskUpdates,
  loadingUpdates,
  hasMoreUpdates,
  updateOffset,
  fetchTaskUpdates,
  taskId,
  commentsMap,
  commentOffsets,
  hasMoreComments,
  loadingComments,
  expandedComments,
  toggleComments,
  fetchComments,
  postComment,
  cachedMentionOptions,
  canPost,
  updatesContainerRef,
  handleS3UploadWithPurge,
  deleteUnsavedS3File,
}) {
  return (
    <div ref={updatesContainerRef} className="task-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingRight: 14 }}>
      {hasMoreUpdates && (
        <Flex justify="center" style={{ marginBottom: 16 }}>
          <button
            onClick={() => fetchTaskUpdates(taskId, updateOffset)}
            disabled={loadingUpdates}
            style={{
              background: 'none', border: '1px dashed #d9d9d9', borderRadius: 20,
              padding: '4px 16px', cursor: 'pointer', fontSize: 12, color: '#8c8c8c',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {loadingUpdates ? 'Loading…' : '↑ Load older updates'}
          </button>
        </Flex>
      )}

      {taskUpdates.length === 0 && !loadingUpdates ? (
        <Text type="secondary" style={{ fontSize: 13 }}>No updates yet.</Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {taskUpdates.map((u, index) => {
            const kind = detectUpdateKind(u.content);
            const lineColor = kind ? STATUS_LINE_COLORS[kind] : '#d9d9d9';
            const isLast = index === taskUpdates.length - 1;
            const isExpanded = !!expandedComments[u.id];

            return (
            <div key={u.id} style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #fafafa' }}>
              {/* Spine: connects this avatar down to the next one, Reddit-timeline style */}
              {!isLast && (
                <div style={{ position: 'absolute', left: 15, top: 32, bottom: -14, width: 2, background: lineColor, zIndex: 0 }} />
              )}
              {/* Branch: while comments are open, forks from the avatar over to the comment thread's own line */}
              {isExpanded && (
                <div
                  style={{
                    position: 'absolute', left: 15, top: 32, width: 29, height: 32,
                    borderLeft: `2px solid ${lineColor}`,
                    borderBottom: `2px solid ${lineColor}`,
                    borderBottomLeftRadius: 10,
                    zIndex: 0,
                  }}
                />
              )}

              <div style={{ position: 'relative', zIndex: 1 }}>
                <Avatar firstName={u.first_name} lastName={u.last_name} />
              </div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <Flex justify="space-between" align="baseline" style={{ marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 16 }}>{u.first_name} {u.last_name}</Text>
                  <Text style={{ fontSize: 13, color: '#18181B', flexShrink: 0, marginLeft: 8 }}>
                    {dayjs(u.created_at).format('MMM D, h:mm A')}
                  </Text>
                </Flex>

                <div style={{ fontSize: 15, lineHeight: 1.6, color: '#1f2937', marginBottom: u.attachments?.length ? 8 : 0 }}>
                  {renderMentions(u.content)}
                </div>

                {u.attachments?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {u.attachments.map((file, idx) => (
                      <AttachmentRow key={idx} file={file} idx={idx} />
                    ))}
                  </div>
                )}

                <CommentsSection
                  update={u}
                  commentsMap={commentsMap}
                  commentOffsets={commentOffsets}
                  hasMoreComments={hasMoreComments}
                  loadingComments={loadingComments}
                  expandedComments={expandedComments}
                  toggleComments={toggleComments}
                  fetchComments={fetchComments}
                  postComment={postComment}
                  taskId={taskId}
                  cachedMentionOptions={cachedMentionOptions}
                  canPost={canPost}
                  handleS3UploadWithPurge={handleS3UploadWithPurge}
                  deleteUnsavedS3File={deleteUnsavedS3File}
                  lineColor={lineColor}
                />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UpdateComposer({ drawerFileList, setDrawerFileList, onPostUpdate, mentionOptions, handleS3UploadWithPurge, deleteUnsavedS3File }) {
  const [text, setText] = useState('');

  const handleClick = () => {
    if (!text.trim() && drawerFileList.length === 0) return;
    onPostUpdate(text);
    setText('');
  };

  return (
    <div style={{ paddingTop: 14, borderTop: '1px solid rgba(24, 24, 27, 0.08)' }}>
      <ChatComposer
        value={text}
        onChange={setText}
        onSend={handleClick}
        placeholder="Add a task update… use @ to mention"
        mentionOptions={mentionOptions}
        fileList={drawerFileList}
        setFileList={setDrawerFileList}
        handleS3UploadWithPurge={handleS3UploadWithPurge}
        deleteUnsavedS3File={deleteUnsavedS3File}
      />
    </div>
  );
}

// Same 6 columns used by both the employee and admin task tables. Admin adds
// its own leading "Team" column on top of this when viewing across teams.
export function buildTaskColumns({ onView }) {
  return [
    { title: 'Task', dataIndex: 'title', key: 'title', render: text => <Text strong>{text}</Text> },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: date => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">No deadline</Text> },
    { title: 'Fulfillment', dataIndex: 'fulfillment_status', key: 'fulfillment', render: status => <Tag color={fulfillmentColor(status)}>{status}</Tag> },
    { title: 'Task Status', dataIndex: 'status', key: 'status', render: status => <Tag color={taskStatusColor(status)}>{status}</Tag> },
    { title: 'Review', dataIndex: 'review_status', key: 'review', render: status => <Tag color={reviewStatusColor(status)}>{status}</Tag> },
    { title: 'Action', key: 'action', width: 120, render: (_, record) => <Button type="primary" size="small" onClick={() => onView(record)}>View Task</Button> },
  ];
}

const PANEL_MIN_WIDTH = 420;
const PANEL_DEFAULT_WIDTH = 760;

// The task-details panel (Overview + Activity & Updates), shared between EmployeeTasksPage
// and TeamTasksPage. `extra` carries each page's own action buttons (submit-for-review vs
// approve/reject/edit/close/reopen), since those differ by role. Centered floating card over
// a blurred backdrop, width resizable by dragging the right edge — stays centered because
// growing the handle side by dx grows total width by 2*dx (the flex-centered wrapper does
// the rest), rather than anchoring one edge and letting the other drift.
export function TaskDetailsDrawer({
  open,
  onClose,
  selectedTask,
  taskDetails,
  user,
  extra,
  showReminders = false,
  taskUpdates,
  loadingUpdates,
  hasMoreUpdates,
  updateOffset,
  fetchTaskUpdates,
  commentsMap,
  commentOffsets,
  hasMoreComments,
  loadingComments,
  expandedComments,
  toggleComments,
  fetchComments,
  postComment,
  cachedMentionOptions,
  updatesContainerRef,
  handleS3UploadWithPurge,
  deleteUnsavedS3File,
  drawerFileList,
  setDrawerFileList,
  onPostUpdate,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [width, setWidth] = useState(PANEL_DEFAULT_WIDTH);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, width: PANEL_DEFAULT_WIDTH });

  useEffect(() => {
    if (open) setActiveTab('overview');
  }, [open, selectedTask?.id]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while open — belt-and-suspenders alongside the portal/backdrop,
  // since Page Down / arrow keys can still scroll the document even without a hover target.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const maxWidth = window.innerWidth - 80;
      setWidth(Math.min(Math.max(dragStartRef.current.width + dx * 2, PANEL_MIN_WIDTH), maxWidth));
    };
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = (e) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, width };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  // Portal straight to <body> — otherwise z-index only wins within the nearest positioned
  // ancestor's stacking context, and here that ancestor sits below the app header/dock's
  // own z-index at the root level, so a high z-index here alone wouldn't be enough.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="task-modal-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(24, 24, 27, 0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            style={{
              position: 'relative',
              width,
              maxWidth: '100%',
              height: '85vh',
              backgroundColor: '#F7F5F2',
              backgroundImage: 'radial-gradient(#18181B22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              borderRadius: 24,
              border: '1px solid rgba(24, 24, 27, 0.08)',
              boxShadow: '0 24px 64px -20px rgba(24, 24, 27, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
        {/* Header */}
        <Flex justify="space-between" align="center" style={{ padding: '20px 24px', borderBottom: '1px solid rgba(24, 24, 27, 0.08)' }}>
          <Title level={4} style={{ margin: 0, letterSpacing: '-0.01em' }}>
            {selectedTask?.title || 'Task Details'}
          </Title>
          <Flex align="center" gap={8}>
            {extra}
            <Button
              type="text"
              shape="circle"
              icon={<CloseOutlined />}
              onClick={onClose}
              style={{ color: 'rgba(24, 24, 27, 0.55)' }}
            />
          </Flex>
        </Flex>

        {/* Overview / Activity toggle — same floating glass-bubble treatment as the app header */}
        <div style={{ padding: '12px 24px 0' }}>
          <div
            style={{
              display: 'inline-flex',
              gap: 4,
              padding: 4,
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.22)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              border: '1px solid rgba(24, 24, 27, 0.12)',
            }}
          >
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'activity', label: 'Activity & Updates' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: activeTab === tab.key ? '#B3455C' : 'transparent',
                  color: activeTab === tab.key ? '#FFFFFF' : 'rgba(24, 24, 27, 0.55)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {selectedTask && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Sliding track: both panels always mounted, side by side, translated as one
                continuous motion — so Overview and Activity visibly cross paths instead of
                one fading out before the other fades in. */}
            <motion.div
              animate={{ x: activeTab === 'overview' ? '0%' : '-50%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              style={{ display: 'flex', width: '200%', height: '100%' }}
            >
              <div className="task-scrollbar" style={{ width: '50%', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', padding: '20px 24px' }}>
                <Card size="small" style={{ backgroundColor: '#fafafa', border: 'none', borderRadius: 10, marginBottom: 16 }}>
                  <Paragraph style={{ margin: 0 }}>
                    {selectedTask.description || <Text type="secondary" italic>No description provided.</Text>}
                  </Paragraph>
                  <Divider style={{ margin: '12px 0' }} />
                  <Flex justify="space-between" wrap="wrap" gap={8}>
                    <Text><InfoCircleOutlined /> Status: <Tag color={taskStatusColor(selectedTask.status)}>{selectedTask.status}</Tag></Text>
                    <Text><CheckCircleOutlined /> Fulfillment: <Tag color={fulfillmentColor(selectedTask.fulfillment_status)}>{selectedTask.fulfillment_status}</Tag></Text>
                    <Text>Review: <Tag color={reviewStatusColor(selectedTask.review_status)}>{selectedTask.review_status}</Tag></Text>
                  </Flex>

                  <Text style={{ display: 'block', marginTop: 8 }}>
                    <CalendarOutlined /> Due:{' '}
                    {(taskDetails?.task?.due_date || selectedTask.due_date)
                      ? dayjs(taskDetails?.task?.due_date || selectedTask.due_date).format('MMM D, YYYY')
                      : <Text type="secondary">No deadline</Text>}
                  </Text>

                  {taskDetails && (
                    <div style={{ marginTop: 12 }}>
                      {(() => {
                        const isCreator = taskDetails.task?.created_by && taskDetails.task.created_by === user?.id;
                        const myParticipant = taskDetails.participants.find(p => p.id === user?.id);
                        const roles = [];
                        if (isCreator) roles.push({ label: 'Task Creator', color: roleColor('CREATOR') });
                        if (myParticipant?.role === 'ASSIGNEE') roles.push({ label: 'Assignee', color: roleColor('ASSIGNEE') });
                        else if (myParticipant?.role === 'SUBSCRIBER') roles.push({ label: 'Subscriber', color: roleColor('SUBSCRIBER') });
                        if (roles.length === 0) return null;
                        return (
                          <Flex align="center" gap={6} style={{ marginBottom: 8 }} wrap="wrap">
                            <Text style={{ fontSize: 12 }}>Your role:</Text>
                            {roles.map(r => <Tag key={r.label} color={r.color} style={{ margin: 0 }}>{r.label}</Tag>)}
                          </Flex>
                        );
                      })()}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Assignees: {taskDetails.participants.filter(p => p.role === 'ASSIGNEE').map(p => p.full_name).join(', ')}
                      </Text>
                      {showReminders && (
                        <>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>Reminders: {taskDetails.reminders?.length || 0}</Text>
                        </>
                      )}
                    </div>
                  )}
                </Card>

                {taskDetails?.attachments?.length > 0 && (
                  <>
                    <Title level={5} style={{ marginBottom: 10 }}>Task Attachments</Title>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {taskDetails.attachments.map((file, idx) => (
                        <AttachmentRow key={idx} file={file} idx={idx} />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px 20px', overflow: 'hidden' }}>
                <UpdateFeed
                  taskUpdates={taskUpdates}
                  loadingUpdates={loadingUpdates}
                  hasMoreUpdates={hasMoreUpdates}
                  updateOffset={updateOffset}
                  fetchTaskUpdates={fetchTaskUpdates}
                  taskId={selectedTask.id}
                  commentsMap={commentsMap}
                  commentOffsets={commentOffsets}
                  hasMoreComments={hasMoreComments}
                  loadingComments={loadingComments}
                  expandedComments={expandedComments}
                  toggleComments={toggleComments}
                  fetchComments={fetchComments}
                  postComment={postComment}
                  cachedMentionOptions={cachedMentionOptions}
                  canPost={selectedTask.status === 'OPEN'}
                  updatesContainerRef={updatesContainerRef}
                  handleS3UploadWithPurge={handleS3UploadWithPurge}
                  deleteUnsavedS3File={deleteUnsavedS3File}
                />

                {selectedTask.status === 'OPEN' && (
                  <UpdateComposer
                    drawerFileList={drawerFileList}
                    setDrawerFileList={setDrawerFileList}
                    onPostUpdate={onPostUpdate}
                    mentionOptions={cachedMentionOptions}
                    handleS3UploadWithPurge={handleS3UploadWithPurge}
                    deleteUnsavedS3File={deleteUnsavedS3File}
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Resize handle — dragging changes total width by 2x the delta so the card stays centered */}
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          style={{
            position: 'absolute', top: 0, right: -8, width: 16, height: '100%',
            cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}
        >
          <div style={{ width: 6, height: 64, borderRadius: 6, background: '#B3455C' }} />
        </div>

        <style>{`
          .task-scrollbar { scrollbar-color: #B3455C transparent; scrollbar-width: thin; }
          .task-scrollbar::-webkit-scrollbar { width: 8px; }
          .task-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .task-scrollbar::-webkit-scrollbar-thumb { background: #B3455C; border-radius: 8px; }
        `}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
