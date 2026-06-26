import React, { useState } from 'react';
import { Typography, Button, Flex, Popover, Mentions, Upload, Tag } from 'antd';
import { CommentOutlined, SendOutlined, DownloadOutlined, PaperClipOutlined, FilePdfOutlined, FileOutlined, SoundOutlined, FileImageOutlined } from '@ant-design/icons';
import AudioAttachment from './AudioAttachment';
import { AudioRecorder } from './AudioRecorder';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

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
}) {
  const isExpanded = expandedComments[update.id];
  const comments = commentsMap[update.id] || [];
  const count = update.comment_count || 0;

  return (
    <div style={{ marginTop: 10 }}>
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
        <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #f0f0f0' }}>
          {loadingComments[update.id] && !comments.length && (
            <Text type="secondary" style={{ fontSize: 12 }}>Loading...</Text>
          )}

          {comments.map(c => (
            <div key={c.id} style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Avatar firstName={c.first_name} lastName={c.last_name} size={24} />
              <div style={{ flex: 1 }}>
                <Flex gap={6} align="baseline">
                  <Text strong style={{ fontSize: 12 }}>{c.first_name} {c.last_name}</Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>{dayjs(c.created_at).format('MMM D, h:mm A')}</Text>
                </Flex>
                <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 1 }}>
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
      {fileList.length > 0 && (
        <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {fileList.map(f => (
            <Tag
              key={f.uid}
              closable
              onClose={() => { deleteUnsavedS3File?.(f); setFileList(prev => prev.filter(i => i.uid !== f.uid)); }}
              style={{ borderRadius: 20, fontSize: 11 }}
            >
              {f.name}
            </Tag>
          ))}
        </div>
      )}
      <Flex gap={6} align="center">
        {handleS3UploadWithPurge && (
          <Upload
            customRequest={(opt) => handleS3UploadWithPurge(opt, setFileList)}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
            showUploadList={false}
            multiple
          >
            <Button icon={<PaperClipOutlined />} shape="circle" size="small" title="Attach file" />
          </Upload>
        )}
        {handleS3UploadWithPurge && (
          <AudioRecorder onUploadSuccess={(fileObj) => setFileList(prev => [...prev, fileObj])} />
        )}
        <Mentions
          style={{ flex: 1 }}
          size="small"
          placeholder="Write a comment… use @ to mention"
          value={text}
          onChange={setText}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          options={mentionOptions}
        />
        <Button type="primary" size="small" icon={<SendOutlined />} onClick={handleSubmit} disabled={!text.trim() && fileList.length === 0}>
          Reply
        </Button>
      </Flex>
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
    <div ref={updatesContainerRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
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
          {taskUpdates.map(u => (
            <div key={u.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #fafafa' }}>
              <Avatar firstName={u.first_name} lastName={u.last_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Flex justify="space-between" align="baseline" style={{ marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>{u.first_name} {u.last_name}</Text>
                  <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
                    {dayjs(u.created_at).format('MMM D, h:mm A')}
                  </Text>
                </Flex>

                <div style={{ fontSize: 13, lineHeight: 1.6, color: '#1f2937', marginBottom: u.attachments?.length ? 8 : 0 }}>
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
                />
              </div>
            </div>
          ))}
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
    <div style={{ paddingTop: 14, borderTop: '1px solid #f0f0f0' }}>
      {drawerFileList.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {drawerFileList.map(f => (
            <Tag
              key={f.uid}
              closable
              onClose={() => { deleteUnsavedS3File(f); setDrawerFileList(drawerFileList.filter(item => item.uid !== f.uid)); }}
              style={{ borderRadius: 20 }}
            >
              {f.name}
            </Tag>
          ))}
        </div>
      )}
      <Flex gap={8} align="center">
        <Upload
          customRequest={(opt) => handleS3UploadWithPurge(opt, setDrawerFileList)}
          fileList={drawerFileList}
          onChange={({ fileList }) => setDrawerFileList(fileList)}
          showUploadList={false}
          multiple
        >
          <Button icon={<PaperClipOutlined />} shape="circle" size="small" title="Attach file" />
        </Upload>
        <AudioRecorder onUploadSuccess={(fileObj) => setDrawerFileList(prev => [...prev, fileObj])} />
        <Mentions
          style={{ flex: 1 }}
          placeholder="Type an update… use @ to mention"
          value={text}
          onChange={setText}
          options={mentionOptions}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleClick}
          disabled={!text.trim() && drawerFileList.length === 0}
        >
          Post
        </Button>
      </Flex>
    </div>
  );
}
