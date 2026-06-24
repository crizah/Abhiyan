import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Drawer, Select, message, Mentions, Tabs, Upload, List, Timeline, Divider, Popconfirm, Image } from 'antd';
import { SendOutlined, InfoCircleOutlined, CheckCircleOutlined, CommentOutlined, PaperClipOutlined, AudioOutlined, DownloadOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios'; 
import { uploadFileToS3 } from '../../../utils/S3Upload';
import { AudioRecorder } from '../../../components/AudioRecorder';
import AudioAttachment from '../../../components/AudioAttachment';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

// Helper to force cross-origin file downloads from S3
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
    console.error('Download failed, falling back to opening in new tab', error);
    window.open(url, '_blank');
  }
};

function CommentInput({ updateId, onSubmit, disabled, mentionOptions }) {
  const [text, setText] = useState('');
  
  const handleSubmit = () => {
    if (!text.trim()) return;
    onSubmit(updateId, text);
    setText('');
  };
  
  return (
    <Flex gap="small" style={{ marginTop: '8px' }}>
      <Mentions
        style={{ flex: 1 }}
        size="small"
        placeholder="Write a comment... use @ to mention"
        value={text}
        onChange={setText}
        onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        options={mentionOptions}
        disabled={disabled}
      />
      <Button type="primary" size="small" icon={<SendOutlined />} onClick={handleSubmit} disabled={!text.trim() || disabled}>
        Reply
      </Button>
    </Flex>
  );
}

function UpdateComposer({ drawerFileList, setDrawerFileList, onPostUpdate, mentionOptions, handleS3UploadWithPurge, deleteUnsavedS3File }) {
  const [text, setText] = useState(''); 

  const handleUpdateClick = () => {
    if (!text.trim() && drawerFileList.length === 0) return;
    onPostUpdate(text); 
    setText(''); 
  };

  return (
    <div style={{ paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
      {drawerFileList.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {drawerFileList.map(f => (
            <Tag closable onClose={() => { deleteUnsavedS3File(f); setDrawerFileList(drawerFileList.filter(item => item.uid !== f.uid)); }} key={f.uid}>
              {f.name}
            </Tag>
          ))}
        </div>
      )}
      <Flex gap="small" align="center">
        <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setDrawerFileList)} fileList={drawerFileList} onChange={({fileList}) => setDrawerFileList(fileList)} showUploadList={false} multiple>
          <Button icon={<PaperClipOutlined />} />
        </Upload>
        <AudioRecorder onUploadSuccess={(fileObj) => setDrawerFileList(prev => [...prev, fileObj])} />

        <Mentions
          style={{ flex: 1 }}
          placeholder="Type an update... use @ to mention team members"
          value={text}
          onChange={setText}
          options={mentionOptions}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={handleUpdateClick} disabled={!text.trim() && drawerFileList.length === 0}>
          Post
        </Button>
      </Flex>
    </div>
  );
}

export default function EmployeeTasksPage() {
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTasks, setTotalTasks] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [updateOffset, setUpdateOffset] = useState(0);
  const [hasMoreUpdates, setHasMoreUpdates] = useState(false);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const UPDATE_LIMIT = 20;

  const [commentsMap, setCommentsMap] = useState({});
  const [commentOffsets, setCommentOffsets] = useState({});
  const [hasMoreComments, setHasMoreComments] = useState({});
  const [loadingComments, setLoadingComments] = useState({});
  const COMMENT_LIMIT = 20;

  const [expandedComments, setExpandedComments] = useState({});
  const [drawerFileList, setDrawerFileList] = useState([]);
  const updatesContainerRef = useRef(null);

  // Memoize team members to prevent Mentions array recreation on every keystroke
  const cachedMentionOptions = React.useMemo(() => {
    return teamMembers.map(m => ({ 
      value: m.full_name.replace(/\s+/g, ''), 
      label: m.full_name 
    }));
  }, [teamMembers]);

  useEffect(() => {
    if (updateOffset <= UPDATE_LIMIT && updatesContainerRef.current) {
      updatesContainerRef.current.scrollTop = updatesContainerRef.current.scrollHeight;
    }
  }, [taskUpdates]);

  useEffect(() => { fetchTeams(); }, []);

  // When Team changes, reset page to 1 and fetch team members
  useEffect(() => {
    if (activeTeamId) {
      setCurrentPage(1);
      apiClient.get(`teams/${activeTeamId}/members`).then(res => setTeamMembers(res.data || [])).catch(() => {});
    } else {
      setTasks([]);
      setTeamMembers([]);
      setTotalTasks(0);
    }
  }, [activeTeamId]);

  // When Team, Page, or Limit changes, fetch the tasks
  useEffect(() => {
    if (activeTeamId) {
      fetchTasks(activeTeamId, currentPage, pageSize);
    }
  }, [activeTeamId, currentPage, pageSize]);

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/employee/teams'); 
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(res.data[0].id);
    } catch (err) { message.error("Failed to load your teams."); }
  };

  const fetchTasks = async (teamId, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/employee/teams/${teamId}/tasks?page=${page}&limit=${limit}`);
      setTasks(res.data.tasks || res.data || []);
      setTotalTasks(res.data.total_count || 0); 
    } catch (err) { 
      message.error("Failed to load your tasks."); 
    } finally { 
      setLoading(false); 
    }
  };

  const deleteUnsavedS3File = (file) => {
    if (file?.s3Data?.file_url && !file.s3Data.id) {
      apiClient.delete('/upload/s3-object', { data: { file_url: file.s3Data.file_url } }).catch(() => {});
    }
  };

  const purgeUnsavedFiles = (fileList) => {
    fileList.filter(f => f.s3Data?.file_url && !f.s3Data?.id).forEach(deleteUnsavedS3File);
  };

  const handleS3UploadWithPurge = async (options, setterFunc) => {
    const { file, onSuccess, onError, onProgress } = options;
    try {
      const s3Metadata = await uploadFileToS3(file, onProgress);
      file.s3Data = s3Metadata;
      onSuccess("OK");
    } catch (err) {
      onError(err);
      setterFunc(prev => prev.filter(item => item.uid !== file.uid));
    }
  };

  const openTaskDrawer = async (task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
    setDrawerFileList([]);
    setTaskUpdates([]);
    setUpdateOffset(0);
    setHasMoreUpdates(false);
    setCommentsMap({});
    setCommentOffsets({});
    setHasMoreComments({});
    setExpandedComments({});
    fetchTaskUpdates(task.id, 0);
    try {
      const res = await apiClient.get(`/tasks/${task.id}/details`);
      setTaskDetails(res.data);
    } catch(err) {}
  };

  const fetchTaskUpdates = async (taskId, offset) => {
    setLoadingUpdates(true);
    try {
      const res = await apiClient.get(`/tasks/${taskId}/updates`, { params: { limit: UPDATE_LIMIT, offset } });
      const fetched = res.data || [];
      if (offset === 0) {
        setTaskUpdates([...fetched].reverse());
      } else {
        setTaskUpdates(prev => [[...fetched].reverse(), ...prev].flat());
      }
      setUpdateOffset(offset + fetched.length);
      setHasMoreUpdates(fetched.length === UPDATE_LIMIT);
    } catch (err) {}
    finally { setLoadingUpdates(false); }
  };

  const fetchComments = async (taskId, updateId, offset) => {
    setLoadingComments(prev => ({ ...prev, [updateId]: true }));
    try {
      const res = await apiClient.get(`/tasks/${taskId}/updates/${updateId}/comments`, { params: { limit: COMMENT_LIMIT, offset } });
      const fetched = res.data || [];
      if (offset === 0) {
        setCommentsMap(prev => ({ ...prev, [updateId]: fetched }));
      } else {
        setCommentsMap(prev => ({ ...prev, [updateId]: [...(prev[updateId] || []), ...fetched] }));
      }
      setCommentOffsets(prev => ({ ...prev, [updateId]: offset + fetched.length }));
      setHasMoreComments(prev => ({ ...prev, [updateId]: fetched.length === COMMENT_LIMIT }));
    } catch (err) {}
    finally { setLoadingComments(prev => ({ ...prev, [updateId]: false })); }
  };

  const toggleComments = (updateId) => {
    const nowExpanded = !expandedComments[updateId];
    setExpandedComments(prev => ({ ...prev, [updateId]: nowExpanded }));
    if (nowExpanded && !commentsMap[updateId]) {
      fetchComments(selectedTask.id, updateId, 0);
    }
  };

  const submitTaskForReview = async () => {
    try {
      await apiClient.put(`/employee/tasks/${selectedTask.id}/submit`);
      message.success(`Task submitted for verification!`);
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, fulfillment_status: 'COMPLETED', review_status: 'PENDING' } : t));
      setSelectedTask(prev => ({ ...prev, fulfillment_status: 'COMPLETED', review_status: 'PENDING' }));
      setTaskUpdates([]);
      setUpdateOffset(0);
      fetchTaskUpdates(selectedTask.id, 0);
      setIsDrawerOpen(false);
    } catch (err) { message.error("Submission failed."); }
  };

  const postTaskUpdate = async (submittedText) => { 
    if (!submittedText.trim() && drawerFileList.length === 0) return;
    try {
      const mentionedIds = teamMembers.filter(m => submittedText.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/tasks/${selectedTask.id}/updates`, {
        content: submittedText, 
        mentioned_user_ids: mentionedIds,
        attachments: drawerFileList.filter(f => f.status === 'done' && f.s3Data).map(f => f.s3Data)
      });
      setDrawerFileList([]);
      setTaskUpdates([]);
      setUpdateOffset(0);
      fetchTaskUpdates(selectedTask.id, 0);
    } catch (err) { message.error("Update publication dropped."); }
  };

  const postComment = async (updateId, text) => {
    try {
      const mentionedIds = teamMembers.filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/tasks/${selectedTask.id}/updates/${updateId}/comments`, {
        content: text,
        mentioned_user_ids: mentionedIds
      });
      setCommentOffsets(prev => ({ ...prev, [updateId]: 0 }));
      fetchComments(selectedTask.id, updateId, 0);
      setTaskUpdates(prev => prev.map(u => u.id === updateId ? { ...u, comment_count: u.comment_count + 1 } : u));
    } catch (err) { message.error("Failed to post comment"); }
  };

  const baseColumns = [
    { title: 'Task', dataIndex: 'title', key: 'title', render: text => <Text strong>{text}</Text> },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: date => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">No deadline</Text> },
    { title: 'Fulfillment', dataIndex: 'fulfillment_status', key: 'fulfillment', render: status => <Tag color={status === 'COMPLETED' ? 'success' : 'processing'}>{status}</Tag> },
    { title: 'Task Status', dataIndex: 'status', key: 'status', render: status => <Tag color={status === 'CLOSED' ? 'default' : status === 'FAILED' ? 'error' : 'blue'}>{status}</Tag> },
    { title: 'Review', dataIndex: 'review_status', key: 'review', render: status => <Tag color={status === 'APPROVED' ? 'gold' : status === 'REJECTED' ? 'error' : status === 'PENDING' ? 'purple' : 'default'}>{status}</Tag> },
    { title: 'Action', key: 'action', width: 120, render: (_, record) => <Button type="primary" size="small" onClick={() => openTaskDrawer(record)}>View Task</Button> }
  ];

  const getTimelineColor = (content) => {
    if (content.includes("Task submitted") || content.includes("Task Approved")) return 'green';
    if (content.includes("TASK REJECTED")) return 'red';
    if (content.includes("TASK REOPENED")) return 'orange';
    return 'blue';
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: '24px' }}>
        <Title level={3} style={{ margin: 0 }}>Task Management</Title>
        <Select value={activeTeamId} onChange={setActiveTeamId} style={{ width: 250 }} options={teams.map(t => ({ label: t.name, value: t.id }))} placeholder="Select a Team" />
      </Flex>
      
      <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Table 
          columns={baseColumns} 
          dataSource={tasks} 
          rowKey="id" 
          loading={loading}
          pagination={{ 
            current: currentPage, 
            pageSize: pageSize, 
            total: totalTasks, 
            showSizeChanger: true 
          }}
          onChange={(pagination) => {
            setCurrentPage(pagination.current);
            setPageSize(pagination.pageSize);
          }}
        />
      </Card>

      <Drawer title={selectedTask?.title || "Task Details"} placement="right" width={700} onClose={() => { purgeUnsavedFiles(drawerFileList); setDrawerFileList([]); setIsDrawerOpen(false); }} open={isDrawerOpen}
        extra={selectedTask?.status === 'OPEN' && selectedTask?.fulfillment_status !== 'COMPLETED' && (
          <Popconfirm title="Submit verification request?" onConfirm={submitTaskForReview}>
            <Button type="primary" style={{ backgroundColor: '#52c41a' }}>Submit for Review</Button>
          </Popconfirm>
        )}
      >
        {selectedTask && (
          <Tabs defaultActiveKey="1" style={{ height: '100%' }}>
            
            {/* FULLY RESTORED OVERVIEW */}
            <Tabs.TabPane tab="Overview" key="1">
              <Card size="small" style={{ backgroundColor: '#f5f5f5', border: 'none', marginBottom: 16 }}>
                <Paragraph style={{ margin: 0 }}>{selectedTask.description || <Text type="secondary" italic>No description provided.</Text>}</Paragraph>
                <Divider style={{ margin: '12px 0' }} />
                <Flex justify="space-between">
                  <Text><InfoCircleOutlined /> Task Status: <Tag color={selectedTask.status === 'CLOSED' ? 'default' : 'blue'}>{selectedTask.status}</Tag></Text>
                  <Text><CheckCircleOutlined /> Fulfillment: <Tag color={selectedTask.fulfillment_status === 'COMPLETED' ? 'success' : 'processing'}>{selectedTask.fulfillment_status}</Tag></Text>
                </Flex>
                <Flex justify="space-between" style={{ marginTop: 12 }}>
                  <Text><InfoCircleOutlined /> Review: <Tag color={selectedTask.review_status === 'APPROVED' ? 'gold' : selectedTask.review_status === 'REJECTED' ? 'error' : selectedTask.review_status === 'PENDING' ? 'purple' : 'default'}>{selectedTask.review_status}</Tag></Text>
                </Flex>
                {taskDetails && taskDetails.participants && (
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Assignees: {taskDetails.participants.filter(p => p.role === 'ASSIGNEE').map(p => p.full_name).join(', ')}</Text><br/>
                    {taskDetails.reminders && <Text type="secondary" style={{ fontSize: 12 }}>Reminders: {taskDetails.reminders.length || 0}</Text>}
                  </div>
                )}
              </Card>

              {taskDetails?.attachments?.length > 0 && (
                <>
                  <Title level={5}>Task Attachments</Title>
                  <List
                    itemLayout="horizontal"
                    dataSource={taskDetails.attachments}
                    renderItem={(file) => (
                      <List.Item
                        extra={!file.file_type.startsWith('audio/') && <Button icon={<DownloadOutlined />} type="text" onClick={() => handleDownload(file.file_url, file.file_name)} title="Download" />}
                      >
                        {file.file_type.startsWith('audio/') ? (
                          <AudioAttachment file={file} />
                        ) : (
                          <List.Item.Meta
                            avatar={<PaperClipOutlined style={{ fontSize: 24 }} />}
                            title={<a href={file.file_url} target="_blank" rel="noreferrer">{file.file_name}</a>}
                            description={`${(file.file_size / 1024).toFixed(2)} KB`}
                          />
                        )}
                      </List.Item>
                    )}
                  />
                </>
              )}
            </Tabs.TabPane>
            
            {/* TIMELINE & COMMENTS */}
            <Tabs.TabPane tab="Activity & Updates" key="2">
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
                <div ref={updatesContainerRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
                  {hasMoreUpdates && (
                    <Flex justify="center" style={{ marginBottom: 12 }}>
                      <Button size="small" loading={loadingUpdates} onClick={() => fetchTaskUpdates(selectedTask.id, updateOffset)}>
                        Load older
                      </Button>
                    </Flex>
                  )}
                  {taskUpdates.length === 0 && !loadingUpdates ? <Text type="secondary">No updates yet.</Text> : (
                    <Timeline
                      items={taskUpdates.map(u => ({
                        color: getTimelineColor(u.content),
                        children: (
                          <>
                            <Flex justify="space-between" align="baseline">
                              <Text strong>{u.first_name} {u.last_name}</Text>
                              <Text type="secondary" style={{ fontSize: '11px' }}>{dayjs(u.created_at).format('MMM D, h:mm A')}</Text>
                            </Flex>
                            <Paragraph style={{ margin: '4px 0 8px 0' }}>{u.content}</Paragraph>

                            {u.attachments?.map((file, idx) => (
                              <div key={idx} style={{ marginBottom: 8 }}>
                                {file.file_type.startsWith('audio/') ? (
                                  <AudioAttachment file={file} />
                                ) : file.file_type.startsWith('image/') ? (
                                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
                                    <Image 
                                      src={file.file_url} 
                                      alt={file.file_name} 
                                      style={{ maxHeight: 150, borderRadius: 8, objectFit: 'cover' }} 
                                    />
                                    <Button 
                                      icon={<DownloadOutlined />} 
                                      size="small" 
                                      type="link" 
                                      onClick={() => handleDownload(file.file_url, file.file_name)}
                                      style={{ padding: 0, height: 'auto', alignSelf: 'flex-start' }}
                                    >
                                      Download
                                    </Button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #d9d9d9', borderRadius: '8px', backgroundColor: '#fff' }}>
                                    <PaperClipOutlined style={{ fontSize: '16px', color: '#8c8c8c' }} />
                                    <a href={file.file_url} target="_blank" rel="noreferrer" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
                                      {file.file_name}
                                    </a>
                                    <Divider type="vertical" style={{ margin: 0 }} />
                                    <Button 
                                      icon={<DownloadOutlined />} 
                                      size="small" 
                                      type="text" 
                                      onClick={() => handleDownload(file.file_url, file.file_name)}
                                      title="Download"
                                    />
                                  </div>
                                )}
                              </div>
                            ))}

                            <div style={{ backgroundColor: '#fafafa', padding: '8px', borderRadius: '6px', border: '1px solid #f0f0f0' }}>
                              <Flex justify="space-between" align="center" style={{ cursor: 'pointer', marginBottom: expandedComments[u.id] ? 8 : 0 }} onClick={() => toggleComments(u.id)}>
                                <Text type="secondary" style={{ fontSize: 12 }}><CommentOutlined /> {u.comment_count || 0} Comments</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>{expandedComments[u.id] ? 'Collapse' : 'Reply'}</Text>
                              </Flex>

                              {expandedComments[u.id] && (
                                <>
                                  {loadingComments[u.id] && !commentsMap[u.id]?.length && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>Loading...</Text>
                                  )}
                                  {(commentsMap[u.id] || []).map(c => (
                                    <div key={c.id} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid #e6f7ff' }}>
                                      <Text strong style={{ fontSize: 12 }}>{c.first_name}</Text> <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(c.created_at).format('MMM D, h:mm A')}</Text>
                                      <div style={{ fontSize: 13 }}>{c.content}</div>
                                    </div>
                                  ))}
                                  {hasMoreComments[u.id] && (
                                    <Button size="small" type="link" loading={loadingComments[u.id]} onClick={() => fetchComments(selectedTask.id, u.id, commentOffsets[u.id] || 0)}>
                                      Load more comments
                                    </Button>
                                  )}
                                  {selectedTask.status === 'OPEN' && (
                                    <CommentInput 
                                      updateId={u.id} 
                                      onSubmit={postComment} 
                                      mentionOptions={cachedMentionOptions} 
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        )
                      }))}
                    />
                  )}
                </div>
                
                {selectedTask.status === 'OPEN' && (
                  <UpdateComposer
                    drawerFileList={drawerFileList}
                    setDrawerFileList={setDrawerFileList}
                    onPostUpdate={postTaskUpdate}
                    mentionOptions={cachedMentionOptions}
                    handleS3UploadWithPurge={handleS3UploadWithPurge}
                    deleteUnsavedS3File={deleteUnsavedS3File}
                  />
                )}
              </div>
            </Tabs.TabPane>
          </Tabs>
        )}
      </Drawer>
    </div>
  );
}