import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Button, Table, Flex, Select, message, Popconfirm } from 'antd';
import apiClient from '../../../config/axios';
import { uploadFileToS3 } from '../../../utils/S3Upload';
import { useAuth } from '../../../context/AuthContext';
import { TaskDetailsDrawer, buildTaskColumns } from '../../../components/TaskDrawerShared';
import { useRefetchOnResume, markFetched } from '../../../hooks/useRefetchOnResume';

const { Title } = Typography;

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

  // Only scope the table to a horizontal scroll container on narrow screens —
  // on desktop the columns should keep stretching to fill the card like before.
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  useRefetchOnResume('employee-teams', () => fetchTeams(), { minIntervalMs: 60000 });

  useEffect(() => {
    if (activeTeamId) {
      setCurrentPage(1);
      fetchTeamMembers(activeTeamId);
    } else {
      setTasks([]);
      setTeamMembers([]);
      setTotalTasks(0);
    }
  }, [activeTeamId]);

  useRefetchOnResume('employee-team-members', () => activeTeamId && fetchTeamMembers(activeTeamId), { minIntervalMs: 60000, enabled: !!activeTeamId });

  useEffect(() => {
    if (activeTeamId) fetchTasks(activeTeamId, currentPage, pageSize);
  }, [activeTeamId, currentPage, pageSize]);

  useRefetchOnResume('employee-tasks-list', () => fetchTasks(activeTeamId, currentPage, pageSize), { minIntervalMs: 60000, enabled: !!activeTeamId });

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/employee/teams');
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(prev => prev || res.data[0].id);
    } catch { message.error("Failed to load your teams."); }
    finally { markFetched('employee-teams'); }
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const res = await apiClient.get(`teams/${teamId}/members`);
      setTeamMembers(res.data || []);
    } catch { /* silent */ }
    finally { markFetched('employee-team-members'); }
  };

  const fetchTasks = async (teamId, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/employee/teams/${teamId}/tasks?page=${page}&limit=${limit}`);
      setTasks(res.data.tasks || res.data || []);
      setTotalTasks(res.data.total_count || 0);
    } catch { message.error("Failed to load your tasks."); }
    finally {
      setLoading(false);
      markFetched('employee-tasks-list');
    }
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
      const s3Metadata = await uploadFileToS3(file, 'uploads', onProgress);
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
    fetchTaskDetails(task.id);
  };

  const fetchTaskDetails = async (taskId) => {
    try {
      const res = await apiClient.get(`/tasks/${taskId}/details`);
      setTaskDetails(res.data);
    } catch {}
    finally { markFetched(`task-details-${taskId}`); }
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
    finally {
      setLoadingUpdates(false);
      markFetched(`task-updates-${taskId}`);
    }
  };

  useRefetchOnResume(
    `task-details-${selectedTask?.id}`,
    () => fetchTaskDetails(selectedTask.id),
    { minIntervalMs: 60000, enabled: isDrawerOpen && !!selectedTask }
  );

  useRefetchOnResume(
    `task-updates-${selectedTask?.id}`,
    () => fetchTaskUpdates(selectedTask.id, 0),
    { minIntervalMs: 60000, enabled: isDrawerOpen && !!selectedTask }
  );

  const [drawerRefreshing, setDrawerRefreshing] = useState(false);

  const refreshTaskDrawer = async () => {
    if (!selectedTask) return;
    setDrawerRefreshing(true);
    try {
      await Promise.all([
        fetchTaskDetails(selectedTask.id),
        fetchTaskUpdates(selectedTask.id, 0),
        ...Object.keys(commentsMap).map(updateId => fetchComments(selectedTask.id, updateId, 0)),
      ]);
    } finally {
      setDrawerRefreshing(false);
    }
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

  const postComment = async (updateId, text, attachments = []) => {
    try {
      const mentionedIds = teamMembers.filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/tasks/${selectedTask.id}/updates/${updateId}/comments`, {
        content: text, mentioned_user_ids: mentionedIds, attachments,
      });
      setCommentOffsets(prev => ({ ...prev, [updateId]: 0 }));
      fetchComments(selectedTask.id, updateId, 0);
      setTaskUpdates(prev => prev.map(u => u.id === updateId ? { ...u, comment_count: u.comment_count + 1 } : u));
    } catch { message.error("Failed to post comment"); }
  };

  const myParticipant = taskDetails?.participants?.find(p => p.id === user?.id);
  const isAssignee = myParticipant?.role === 'ASSIGNEE';
  const canSubmit = selectedTask?.status === 'OPEN' && selectedTask?.fulfillment_status !== 'COMPLETED' && isAssignee;

  const columns = buildTaskColumns({ onView: openTaskDrawer });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: '24px' }}>
        <Title level={3} style={{ margin: 0 }}>Task Management</Title>
        <Select value={activeTeamId} onChange={setActiveTeamId} style={{ width: 250, maxWidth: '100%' }} options={teams.map(t => ({ label: t.name, value: t.id }))} placeholder="Select a Team" />
      </Flex>

      <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          scroll={isMobile ? { x: 'max-content' } : undefined}
          pagination={{ current: currentPage, pageSize, total: totalTasks, showSizeChanger: true }}
          onChange={(pagination) => { setCurrentPage(pagination.current); setPageSize(pagination.pageSize); }}
        />
      </Card>

      <TaskDetailsDrawer
        open={isDrawerOpen}
        onClose={() => { purgeUnsavedFiles(drawerFileList); setDrawerFileList([]); setIsDrawerOpen(false); }}
        selectedTask={selectedTask}
        taskDetails={taskDetails}
        user={user}
        onRefresh={refreshTaskDrawer}
        refreshing={drawerRefreshing}
        extra={canSubmit && (
          <Popconfirm title="Submit this task for review?" onConfirm={submitTaskForReview}>
            <Button type="primary" style={{ backgroundColor: '#B3455C', border: 'none' }}>Submit for Review</Button>
          </Popconfirm>
        )}
        taskUpdates={taskUpdates}
        loadingUpdates={loadingUpdates}
        hasMoreUpdates={hasMoreUpdates}
        updateOffset={updateOffset}
        fetchTaskUpdates={fetchTaskUpdates}
        commentsMap={commentsMap}
        commentOffsets={commentOffsets}
        hasMoreComments={hasMoreComments}
        loadingComments={loadingComments}
        expandedComments={expandedComments}
        toggleComments={toggleComments}
        fetchComments={fetchComments}
        postComment={postComment}
        cachedMentionOptions={cachedMentionOptions}
        updatesContainerRef={updatesContainerRef}
        handleS3UploadWithPurge={handleS3UploadWithPurge}
        deleteUnsavedS3File={deleteUnsavedS3File}
        drawerFileList={drawerFileList}
        setDrawerFileList={setDrawerFileList}
        onPostUpdate={postTaskUpdate}
      />
    </div>
  );
}
