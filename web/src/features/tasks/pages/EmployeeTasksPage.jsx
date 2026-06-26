import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Drawer, Select, message, Mentions, Tabs, Upload, List, Divider, Popconfirm, Image } from 'antd';
import { InfoCircleOutlined, CheckCircleOutlined, PaperClipOutlined, DownloadOutlined, SoundOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios';
import { uploadFileToS3 } from '../../../utils/S3Upload';
import AudioAttachment from '../../../components/AudioAttachment';
import { useAuth } from '../../../context/AuthContext';
import { UpdateFeed, UpdateComposer, AttachmentRow } from '../../../components/TaskDrawerShared';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

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

export default function EmployeeTasksPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const cachedMentionOptions = React.useMemo(
    () => teamMembers.map(m => ({ value: m.full_name.replace(/\s+/g, ''), label: m.full_name })),
    [teamMembers],
  );

  useEffect(() => {
    if (updateOffset <= UPDATE_LIMIT && updatesContainerRef.current) {
      updatesContainerRef.current.scrollTop = updatesContainerRef.current.scrollHeight;
    }
  }, [taskUpdates]);

  useEffect(() => { fetchTeams(); }, []);

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

  useEffect(() => {
    if (activeTeamId) fetchTasks(activeTeamId, currentPage, pageSize);
  }, [activeTeamId, currentPage, pageSize]);

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/employee/teams');
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(res.data[0].id);
    } catch { message.error("Failed to load your teams."); }
  };

  const fetchTasks = async (teamId, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/employee/teams/${teamId}/tasks?page=${page}&limit=${limit}`);
      setTasks(res.data.tasks || res.data || []);
      setTotalTasks(res.data.total_count || 0);
    } catch { message.error("Failed to load your tasks."); }
    finally { setLoading(false); }
  };

  const deleteUnsavedS3File = (file) => {
    if (file?.s3Data?.file_url && !file.s3Data.id)
      apiClient.delete('/upload/s3-object', { data: { file_url: file.s3Data.file_url } }).catch(() => {});
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
    setTaskDetails(null);
    fetchTaskUpdates(task.id, 0);
    try {
      const res = await apiClient.get(`/tasks/${task.id}/details`);
      setTaskDetails(res.data);
    } catch {}
  };

  const fetchTaskUpdates = async (taskId, offset) => {
    setLoadingUpdates(true);
    try {
      const res = await apiClient.get(`/tasks/${taskId}/updates`, { params: { limit: UPDATE_LIMIT, offset } });
      const fetched = res.data || [];
      if (offset === 0) setTaskUpdates([...fetched].reverse());
      else setTaskUpdates(prev => [[...fetched].reverse(), ...prev].flat());
      setUpdateOffset(offset + fetched.length);
      setHasMoreUpdates(fetched.length === UPDATE_LIMIT);
    } catch {}
    finally { setLoadingUpdates(false); }
  };

  const fetchComments = async (taskId, updateId, offset) => {
    setLoadingComments(prev => ({ ...prev, [updateId]: true }));
    try {
      const res = await apiClient.get(`/tasks/${taskId}/updates/${updateId}/comments`, { params: { limit: COMMENT_LIMIT, offset } });
      const fetched = res.data || [];
      if (offset === 0) setCommentsMap(prev => ({ ...prev, [updateId]: fetched }));
      else setCommentsMap(prev => ({ ...prev, [updateId]: [...(prev[updateId] || []), ...fetched] }));
      setCommentOffsets(prev => ({ ...prev, [updateId]: offset + fetched.length }));
      setHasMoreComments(prev => ({ ...prev, [updateId]: fetched.length === COMMENT_LIMIT }));
    } catch {}
    finally { setLoadingComments(prev => ({ ...prev, [updateId]: false })); }
  };

  const toggleComments = (updateId) => {
    const nowExpanded = !expandedComments[updateId];
    setExpandedComments(prev => ({ ...prev, [updateId]: nowExpanded }));
    if (nowExpanded && !commentsMap[updateId]) fetchComments(selectedTask.id, updateId, 0);
  };

  const submitTaskForReview = async () => {
    try {
      await apiClient.put(`/employee/tasks/${selectedTask.id}/submit`);
      message.success('Task submitted for verification!');
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, fulfillment_status: 'COMPLETED', review_status: 'PENDING' } : t));
      setSelectedTask(prev => ({ ...prev, fulfillment_status: 'COMPLETED', review_status: 'PENDING' }));
      setTaskUpdates([]);
      setUpdateOffset(0);
      fetchTaskUpdates(selectedTask.id, 0);
      setIsDrawerOpen(false);
    } catch { message.error("Submission failed."); }
  };

  const postTaskUpdate = async (submittedText) => {
    if (!submittedText.trim() && drawerFileList.length === 0) return;
    try {
      const mentionedIds = teamMembers.filter(m => submittedText.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/tasks/${selectedTask.id}/updates`, {
        content: submittedText,
        mentioned_user_ids: mentionedIds,
        attachments: drawerFileList.filter(f => f.status === 'done' && f.s3Data).map(f => f.s3Data),
      });
      setDrawerFileList([]);
      setTaskUpdates([]);
      setUpdateOffset(0);
      fetchTaskUpdates(selectedTask.id, 0);
    } catch { message.error("Update publication dropped."); }
  };

  const postComment = async (updateId, text) => {
    try {
      const mentionedIds = teamMembers.filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/tasks/${selectedTask.id}/updates/${updateId}/comments`, {
        content: text, mentioned_user_ids: mentionedIds,
      });
      setCommentOffsets(prev => ({ ...prev, [updateId]: 0 }));
      fetchComments(selectedTask.id, updateId, 0);
      setTaskUpdates(prev => prev.map(u => u.id === updateId ? { ...u, comment_count: u.comment_count + 1 } : u));
    } catch { message.error("Failed to post comment"); }
  };

  const myParticipant = taskDetails?.participants?.find(p => p.id === user?.id);
  const isAssignee = myParticipant?.role === 'ASSIGNEE';
  const canSubmit = selectedTask?.status === 'OPEN' && selectedTask?.fulfillment_status !== 'COMPLETED' && isAssignee;

  const baseColumns = [
    { title: 'Task', dataIndex: 'title', key: 'title', render: text => <Text strong>{text}</Text> },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: date => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">No deadline</Text> },
    { title: 'Fulfillment', dataIndex: 'fulfillment_status', key: 'fulfillment', render: status => <Tag color={status === 'COMPLETED' ? 'success' : 'processing'}>{status}</Tag> },
    { title: 'Task Status', dataIndex: 'status', key: 'status', render: status => <Tag color={status === 'CLOSED' ? 'default' : status === 'FAILED' ? 'error' : 'blue'}>{status}</Tag> },
    { title: 'Review', dataIndex: 'review_status', key: 'review', render: status => <Tag color={status === 'APPROVED' ? 'gold' : status === 'REJECTED' ? 'error' : status === 'PENDING' ? 'purple' : 'default'}>{status}</Tag> },
    { title: 'Action', key: 'action', width: 120, render: (_, record) => <Button type="primary" size="small" onClick={() => openTaskDrawer(record)}>View Task</Button> },
  ];

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
          pagination={{ current: currentPage, pageSize, total: totalTasks, showSizeChanger: true }}
          onChange={(pagination) => { setCurrentPage(pagination.current); setPageSize(pagination.pageSize); }}
        />
      </Card>

      <Drawer
        title={selectedTask?.title || "Task Details"}
        placement="right"
        width="80%"
        onClose={() => { purgeUnsavedFiles(drawerFileList); setDrawerFileList([]); setIsDrawerOpen(false); }}
        open={isDrawerOpen}
        extra={canSubmit && (
          <Popconfirm title="Submit this task for review?" onConfirm={submitTaskForReview}>
            <Button type="primary" style={{ backgroundColor: '#52c41a' }}>Submit for Review</Button>
          </Popconfirm>
        )}
      >
        {selectedTask && (
          <Tabs defaultActiveKey="1" style={{ height: '100%' }}>
            <Tabs.TabPane tab="Overview" key="1">
              <Card size="small" style={{ backgroundColor: '#fafafa', border: 'none', borderRadius: 10, marginBottom: 16 }}>
                <Paragraph style={{ margin: 0 }}>
                  {selectedTask.description || <Text type="secondary" italic>No description provided.</Text>}
                </Paragraph>
                <Divider style={{ margin: '12px 0' }} />
                <Flex justify="space-between" wrap="wrap" gap={8}>
                  <Text><InfoCircleOutlined /> Status: <Tag color={selectedTask.status === 'CLOSED' ? 'default' : 'blue'}>{selectedTask.status}</Tag></Text>
                  <Text><CheckCircleOutlined /> Fulfillment: <Tag color={selectedTask.fulfillment_status === 'COMPLETED' ? 'success' : 'processing'}>{selectedTask.fulfillment_status}</Tag></Text>
                  <Text>Review: <Tag color={selectedTask.review_status === 'APPROVED' ? 'gold' : selectedTask.review_status === 'REJECTED' ? 'error' : selectedTask.review_status === 'PENDING' ? 'purple' : 'default'}>{selectedTask.review_status}</Tag></Text>
                </Flex>

                {taskDetails && (
                  <div style={{ marginTop: 12 }}>
                    {(() => {
                      const isCreator = taskDetails.task?.created_by && taskDetails.task.created_by === user?.id;
                      const roles = [];
                      if (isCreator) roles.push({ label: 'Task Creator', color: 'gold' });
                      if (myParticipant?.role === 'ASSIGNEE') roles.push({ label: 'Assignee', color: 'blue' });
                      else if (myParticipant?.role === 'SUBSCRIBER') roles.push({ label: 'Subscriber', color: 'default' });
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
            </Tabs.TabPane>

            <Tabs.TabPane tab="Activity & Updates" key="2">
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
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
                />

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
