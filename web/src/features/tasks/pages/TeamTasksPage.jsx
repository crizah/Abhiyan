import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Select, message, Modal, Input, Form, DatePicker, Divider, Popconfirm, Upload } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { PlusOutlined, ClockCircleOutlined, PaperClipOutlined, EditOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios';
import { uploadFileToS3 } from '../../../utils/S3Upload';
import { AudioRecorder } from '../../../components/AudioRecorder';
import { TaskDetailsDrawer, buildTaskColumns } from '../../../components/TaskDrawerShared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function TeamTasksPage() {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTasks, setTotalTasks] = useState(0);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [updateOffset, setUpdateOffset] = useState(0);
  const [hasMoreUpdates, setHasMoreUpdates] = useState(false);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const UPDATE_LIMIT = 20;

  const [commentsMap, setCommentsMap] = useState({});       // updateId -> comments[]
  const [commentOffsets, setCommentOffsets] = useState({}); // updateId -> offset
  const [hasMoreComments, setHasMoreComments] = useState({}); // updateId -> bool
  const [loadingComments, setLoadingComments] = useState({}); // updateId -> bool
  const COMMENT_LIMIT = 20;

  const [expandedComments, setExpandedComments] = useState({});
  const [editDirty, setEditDirty] = useState(false);
  const editSnapshotRef = useRef(null);
  const updatesContainerRef = useRef(null);

  // Memoize team members to prevent Mentions array recreation on every keystroke
  const cachedMentionOptions = React.useMemo(() => {
    return teamMembers.map(m => ({ 
      value: m.full_name.replace(/\s+/g, ''), 
      label: m.full_name 
    }));
  }, [teamMembers]);

  // Scroll to bottom on fresh load (offset=0) and after posting
  useEffect(() => {
    if (updateOffset <= UPDATE_LIMIT && updatesContainerRef.current) {
      updatesContainerRef.current.scrollTop = updatesContainerRef.current.scrollHeight;
    }
  }, [taskUpdates]);

  // Managed File Array Hooks
  const [createFileList, setCreateFileList] = useState([]);
  const [editFileList, setEditFileList] = useState([]);
  const [actionFileList, setActionFileList] = useState([]);
  const [drawerFileList, setDrawerFileList] = useState([]);

  useEffect(() => { fetchTeams(); }, []);

  // Reset page to 1 whenever the team changes
  useEffect(() => {
    if (activeTeamId) {
      setCurrentPage(1);
      if (activeTeamId !== 'ALL') fetchTeamMembers(activeTeamId);
      else setTeamMembers([]);
    } else {
      setTasks([]);
      setTeamMembers([]);
      setTotalTasks(0);
    }
  }, [activeTeamId]);

  // Fetch tasks whenever team, page, or pageSize changes
  useEffect(() => {
    if (activeTeamId) {
      fetchTasks(activeTeamId, currentPage, pageSize);
    }
  }, [activeTeamId, currentPage, pageSize]);

  useEffect(() => { 
    form.resetFields(); 
    setCreateFileList([]); 
  }, [activeTeamId, form]);

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/admin/my-teams'); 
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(res.data[0].id);
    } catch (err) { message.error("Failed to load teams."); }
  };

  const fetchTasks = async (teamId, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const endpoint = teamId === 'ALL' ? '/admin/tasks' : `/admin/teams/${teamId}/tasks`;
      const res = await apiClient.get(endpoint, { params: { page, limit } });
      setTasks(res.data.tasks || []);
      setTotalTasks(res.data.total_count || 0);
    } catch (err) { message.error("Failed to load tasks."); }
    finally { setLoading(false); }
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const res = await apiClient.get(`/admin/teams/${teamId}/members`);
      setTeamMembers(res.data || []);
    } catch (err) {}
  };

  const handleS3UploadWithPurge = async (options, setterFunc) => {
    const { file, onSuccess, onError, onProgress } = options;
    try {
      const s3Metadata = await uploadFileToS3(file,'uploads', onProgress);
      file.s3Data = s3Metadata;
      onSuccess("OK");
    } catch (err) {
      onError(err);
      setterFunc(prev => prev.filter(item => item.uid !== file.uid));
    }
  };

  const getS3Attachments = (list) => list.filter(f => f.status === 'done' && f.s3Data).map(f => f.s3Data);

  const deleteUnsavedS3File = (file) => {
    if (file?.s3Data?.file_url && !file.s3Data.id) {
      apiClient.delete('/upload/s3-object', { data: { file_url: file.s3Data.file_url } }).catch(() => {});
    }
  };

  const purgeUnsavedFiles = (fileList) => {
    fileList.filter(f => f.s3Data?.file_url && !f.s3Data?.id).forEach(deleteUnsavedS3File);
  };

  // Backend stores one reminder row per channel; the form lets a user pick multiple
  // channels for a single scheduled alert, so fan that out into one payload entry per channel.
  const expandRemindersByChannel = (reminders) => (reminders || []).flatMap(r =>
    (r.channel || []).map(channel => ({
      channel, scheduled_at: r.scheduled_at.toISOString(),
      recurrence_value: r.recurrence_value ? parseInt(r.recurrence_value, 10) : undefined,
      recurrence_unit: r.recurrence_unit || undefined
    }))
  );

  // Inverse of expandRemindersByChannel: recombine rows that share the same schedule
  // so an edit form shows one row with both channels checked, not two duplicate rows.
  const groupRemindersByChannel = (reminders) => {
    const groups = [];
    (reminders || []).forEach(r => {
      const key = `${r.scheduled_at}|${r.recurrence_value || ''}|${r.recurrence_unit || ''}`;
      const existing = groups.find(g => g.key === key);
      if (existing) existing.channel.push(r.channel);
      else groups.push({
        key, channel: [r.channel], scheduled_at: dayjs(r.scheduled_at),
        recurrence_value: r.recurrence_value, recurrence_unit: r.recurrence_unit
      });
    });
    return groups.map(({ key, ...rest }) => rest);
  };

  const handleCreateTask = async (values) => {
    try {
      const payload = {
        team_id: activeTeamId, title: values.title, description: values.description,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        assignee_ids: values.assignees, subscriber_ids: values.subscribers || [],
        reminders: expandRemindersByChannel(values.reminders),
        attachments: getS3Attachments(createFileList)
      };
      await apiClient.post(`/admin/teams/${activeTeamId}/tasks`, payload);
      message.success("Task created!");
      setIsCreateModalOpen(false);
      form.resetFields();
      setCreateFileList([]);
      fetchTasks(activeTeamId, currentPage, pageSize);
    } catch (err) { message.error("Failed to create task"); }
  };

  const snapshotEditState = (formValues, fileList) => JSON.stringify({
    ...formValues,
    due_date: formValues.due_date ? formValues.due_date.toISOString() : null,
    reminders: (formValues.reminders || []).map(r => ({ ...r, scheduled_at: r.scheduled_at?.toISOString() })),
    attachmentUIDs: fileList.map(f => f.uid).sort()
  });

  const checkEditDirty = (currentValues, currentFileList) => {
    const current = snapshotEditState(currentValues || editForm.getFieldsValue(), currentFileList || editFileList);
    setEditDirty(current !== editSnapshotRef.current);
  };

  const openEditModal = () => {
    editForm.setFieldsValue({
      title: selectedTask.title, description: selectedTask.description,
      due_date: selectedTask.due_date ? dayjs(selectedTask.due_date) : null,
      assignees: (taskDetails?.participants || []).filter(p => p.role === 'ASSIGNEE').map(p => p.id),
      subscribers: (taskDetails?.participants || []).filter(p => p.role === 'SUBSCRIBER').map(p => p.id),
      reminders: groupRemindersByChannel(taskDetails?.reminders)
    });
    const initialFileList = (taskDetails?.attachments || []).map(att => ({
      uid: att.id || att.file_url, name: att.file_name, status: 'done', url: att.file_url,
      s3Data: { id: att.id, file_name: att.file_name, file_url: att.file_url, file_type: att.file_type, file_size: att.file_size }
    }));
    setEditFileList(initialFileList);
    setEditDirty(false);
    setTimeout(() => { editSnapshotRef.current = snapshotEditState(editForm.getFieldsValue(), initialFileList); }, 0);
    setIsEditModalOpen(true);
  };

  const handleEditTask = async (values) => {
    try {
      const payload = {
        title: values.title, description: values.description,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        assignee_ids: values.assignees, subscriber_ids: values.subscribers || [],
        reminders: expandRemindersByChannel(values.reminders),
        attachments: getS3Attachments(editFileList)
      };
      await apiClient.put(`/admin/tasks/${selectedTask.id}`, payload);
      message.success("Task updated!");
      setIsEditModalOpen(false);
      fetchTasks(activeTeamId, currentPage, pageSize);
      openTaskDrawer(selectedTask);
    } catch (err) { message.error("Failed to update task"); }
  };

  const openActionModal = () => {
    actionForm.setFieldsValue({
      note: '', due_date: selectedTask.due_date ? dayjs(selectedTask.due_date) : null,
      reminders: groupRemindersByChannel(taskDetails?.reminders)
    });
    setActionFileList((taskDetails?.attachments || []).map(att => ({
      uid: att.id || att.file_url, name: att.file_name, status: 'done', url: att.file_url,
      s3Data: { id: att.id, file_name: att.file_name, file_url: att.file_url, file_type: att.file_type, file_size: att.file_size }
    })));
    setIsActionModalOpen(true);
  };

  const handleActionTask = async (values) => {
    try {
      const payload = {
        note: values.note, due_date: values.due_date ? values.due_date.toISOString() : null,
        reminders: expandRemindersByChannel(values.reminders),
        attachments: getS3Attachments(actionFileList)
      };
      const actionType = selectedTask.status === 'CLOSED' ? 'REOPEN' : 'REJECT';
      await apiClient.put(`/admin/tasks/${selectedTask.id}/action/${actionType}`, payload);
      message.success(`Task ${actionType.toLowerCase()}ed successfully!`);
      setIsActionModalOpen(false);
      window.dispatchEvent(new Event('refresh-notifications'));
      fetchTasks(activeTeamId, currentPage, pageSize);
      setIsDrawerOpen(false); 
    } catch (err) { message.error("Action handler failed."); }
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
      const res = await apiClient.get(`/admin/tasks/${task.id}/details`);
      setTaskDetails(res.data);
    } catch(err) {}
  };

  const fetchTaskUpdates = async (taskId, offset) => {
    setLoadingUpdates(true);
    try {
      const res = await apiClient.get(`/admin/tasks/${taskId}/updates`, { params: { limit: UPDATE_LIMIT, offset } });
      const fetched = res.data || [];
      // API returns newest-first; for "load older" we append at the bottom of the reversed list
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
      const res = await apiClient.get(`/admin/tasks/${taskId}/updates/${updateId}/comments`, { params: { limit: COMMENT_LIMIT, offset } });
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
    // Fetch on first open only
    if (nowExpanded && !commentsMap[updateId]) {
      fetchComments(selectedTask.id, updateId, 0);
    }
  };

  const postTaskUpdate = async (submittedText) => {
    if (!submittedText.trim() && drawerFileList.length === 0) return;
    try {
      const mentionedIds = teamMembers.filter(m => submittedText.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/admin/tasks/${selectedTask.id}/updates`, {
        content: submittedText,
        mentioned_user_ids: mentionedIds,
        attachments: getS3Attachments(drawerFileList)
      });
      setDrawerFileList([]);
      // Reset and refetch from top to show the new update at the bottom
      setTaskUpdates([]);
      setUpdateOffset(0);
      fetchTaskUpdates(selectedTask.id, 0);
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to post update."); }
  };

  const handleApprove = async () => {
    try {
      await apiClient.put(`/admin/tasks/${selectedTask.id}/approve`);
      message.success("Task approved!");
      window.dispatchEvent(new Event('refresh-notifications'));
      fetchTasks(activeTeamId, currentPage, pageSize);
      setIsDrawerOpen(false);
    } catch (err) { message.error("Failed to approve."); }
  };

  const changeTaskStatus = async (newStatus) => {
    try {
      await apiClient.put(`/admin/tasks/${selectedTask.id}/status`, { status: newStatus });
      message.success(`Task marked as ${newStatus}`);
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: newStatus } : t));
      setSelectedTask(prev => ({ ...prev, status: newStatus }));
      setIsDrawerOpen(false);
    } catch (err) { message.error("Failed to update status."); }
  };

  const postComment = async (updateId, text, attachments = []) => {
    try {
      const mentionedIds = teamMembers.filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/admin/tasks/${selectedTask.id}/updates/${updateId}/comments`, {
        content: text,
        mentioned_user_ids: mentionedIds,
        attachments,
      });
      setCommentOffsets(prev => ({ ...prev, [updateId]: 0 }));
      fetchComments(selectedTask.id, updateId, 0);
      setTaskUpdates(prev => prev.map(u => u.id === updateId ? { ...u, comment_count: u.comment_count + 1 } : u));
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to post comment"); }
  };

  const baseColumns = buildTaskColumns({ onView: openTaskDrawer });
  const columns = activeTeamId === 'ALL' ? [{ title: 'Team', dataIndex: 'team_name', key: 'team_name', render: text => <Tag color="geekblue">{text}</Tag> }, ...baseColumns] : baseColumns;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: '24px' }}>
        <Title level={3} style={{ margin: 0 }}>Task Management</Title>
        <Flex gap="small">
          <Select value={activeTeamId} onChange={setActiveTeamId} style={{ width: 200 }} options={[{ label: 'All My Teams', value: 'ALL' }, ...teams.map(t => ({ label: t.name, value: t.id }))]} placeholder="Select a Team" />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setIsCreateModalOpen(true); }} disabled={!activeTeamId || activeTeamId === 'ALL'}>Assign New Task</Button>
        </Flex>
      </Flex>

      <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalTasks,
            showSizeChanger: true,
          }}
          onChange={(pagination) => {
            setCurrentPage(pagination.current);
            setPageSize(pagination.pageSize);
          }}
        />
      </Card>

      {/* CREATE MODAL */}
      <Modal destroyOnClose title="Assign New Task" open={isCreateModalOpen} onCancel={() => { purgeUnsavedFiles(createFileList); setCreateFileList([]); setIsCreateModalOpen(false); }} width={700} footer={[<Button key="back" onClick={() => { purgeUnsavedFiles(createFileList); setCreateFileList([]); setIsCreateModalOpen(false); }}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => form.submit()}>Create Task</Button>]}>
        <Form form={form} layout="vertical" onFinish={handleCreateTask}>
          <Form.Item name="title" label="Task Title" rules={[{ required: true }]}><Input size="large" /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>

          <Form.Item label="Attachments">
            <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setCreateFileList)} fileList={createFileList} onRemove={deleteUnsavedS3File} onChange={({fileList}) => setCreateFileList(fileList)} multiple>
              <Button icon={<PaperClipOutlined />}>Upload Files</Button>
            </Upload>
            <Divider style={{ margin: '8px 0' }} />
            <AudioRecorder onUploadSuccess={(fileObj) => setCreateFileList(prev => [...prev, fileObj])} />
          </Form.Item>

          <Flex gap="middle">
            <Form.Item name="assignees" label="Assign To" style={{ flex: 1 }} rules={[{ required: true }]}><Select mode="multiple" options={teamMembers.map(m => ({ label: m.full_name, value: m.id }))} /></Form.Item>
            <Form.Item name="subscribers" label="Subscribers" style={{ flex: 1 }}><Select mode="multiple" options={teamMembers.map(m => ({ label: m.full_name, value: m.id }))} /></Form.Item>
          </Flex>
          <Form.Item name="due_date" label="Deadline"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
          
          <Divider orientation="left">Automated Reminders</Divider>
          <Form.List name="reminders">
             {(fields, { add, remove }) => (
               <>{fields.map(({ key, name, ...restField }) => (
                   <Card size="small" key={key} style={{ marginBottom: 8, backgroundColor: '#f9f9f9' }}>
                     <Flex gap="small" align="flex-end">
                       <Form.Item {...restField} name={[name, 'channel']} label="Channels" rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one channel' }]} style={{ margin: 0, width: 200 }}><Select mode="multiple" options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_value']} label="Every" style={{ margin: 0, width: 80 }}><Input type="number" min={1} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 110 }}><Select options={[{value: 'HOURS', label: 'Hours'}, {value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear /></Form.Item>
                       <Button danger onClick={() => remove(name)}>X</Button>
                     </Flex>
                   </Card>
                 ))}
                 <Button type="dashed" onClick={() => add()} block icon={<ClockCircleOutlined />}>Add Scheduled Reminder</Button>
               </>
             )}
          </Form.List>
        </Form>
      </Modal>

      {/* EDIT MODAL */}
      <Modal destroyOnClose title="Edit Task Details" open={isEditModalOpen} onCancel={() => { purgeUnsavedFiles(editFileList); setIsEditModalOpen(false); }} width={700} footer={[<Button key="back" onClick={() => { purgeUnsavedFiles(editFileList); setIsEditModalOpen(false); }}>Cancel</Button>, <Button key="submit" type="primary" disabled={!editDirty} onClick={() => editForm.submit()}>Save Changes</Button>]}>
        <Form form={editForm} layout="vertical" onFinish={handleEditTask} onValuesChange={() => checkEditDirty()}>
          <Form.Item name="title" label="Task Title" rules={[{ required: true }]}><Input size="large" /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>

          <Form.Item label="Task Attachments">
            <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setEditFileList)} fileList={editFileList} onRemove={deleteUnsavedS3File} onChange={({fileList}) => { setEditFileList(fileList); checkEditDirty(null, fileList); }} multiple>
              <Button icon={<PaperClipOutlined />}>Add Files</Button>
            </Upload>
            <Divider style={{ margin: '8px 0' }} />
            <AudioRecorder onUploadSuccess={(fileObj) => setEditFileList(prev => { const next = [...prev, fileObj]; checkEditDirty(null, next); return next; })} />
          </Form.Item>

          <Flex gap="middle">
            <Form.Item name="assignees" label="Assign To" style={{ flex: 1 }} rules={[{ required: true }]}><Select mode="multiple" options={teamMembers.map(m => ({ label: m.full_name, value: m.id }))} /></Form.Item>
            <Form.Item name="subscribers" label="Subscribers" style={{ flex: 1 }}><Select mode="multiple" options={teamMembers.map(m => ({ label: m.full_name, value: m.id }))} /></Form.Item>
          </Flex>
          <Form.Item name="due_date" label="Deadline"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
          
          <Divider orientation="left">Automated Reminders</Divider>
          <Form.List name="reminders">
             {(fields, { add, remove }) => (
               <>{fields.map(({ key, name, ...restField }) => (
                   <Card size="small" key={key} style={{ marginBottom: 8, backgroundColor: '#f9f9f9' }}>
                     <Flex gap="small" align="flex-end">
                       <Form.Item {...restField} name={[name, 'channel']} label="Channels" rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one channel' }]} style={{ margin: 0, width: 200 }}><Select mode="multiple" options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_value']} label="Every" style={{ margin: 0, width: 80 }}><Input type="number" min={1} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 110 }}><Select options={[{value: 'HOURS', label: 'Hours'}, {value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear /></Form.Item>
                       <Button danger onClick={() => remove(name)}>X</Button>
                     </Flex>
                   </Card>
                 ))}
                 <Button type="dashed" onClick={() => add()} block icon={<ClockCircleOutlined />}>Add Scheduled Reminder</Button>
               </>
             )}
          </Form.List>
        </Form>
      </Modal>

      {/* ACTION MODAL (Reopen / Reject) */}
      <Modal destroyOnClose title={selectedTask?.status === 'CLOSED' ? "Reopen Task" : "Reject Task"} open={isActionModalOpen} onCancel={() => { purgeUnsavedFiles(actionFileList); setIsActionModalOpen(false); }} width={700} footer={[<Button key="back" onClick={() => { purgeUnsavedFiles(actionFileList); setIsActionModalOpen(false); }}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => actionForm.submit()}>{selectedTask?.status === 'CLOSED' ? "Confirm Reopen" : "Confirm Rejection"}</Button>]}>
        <Form form={actionForm} layout="vertical" onFinish={handleActionTask}>
          <Form.Item name="note" label="Action Note (Optional)"><TextArea rows={2} /></Form.Item>

          <Form.Item label="Attach Evidence/Voice Explanations">
            <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setActionFileList)} fileList={actionFileList} onRemove={deleteUnsavedS3File} onChange={({fileList}) => setActionFileList(fileList)} multiple>
              <Button icon={<PaperClipOutlined />}>Upload Files</Button>
            </Upload>
            <Divider style={{ margin: '8px 0' }} />
            <AudioRecorder onUploadSuccess={(fileObj) => setActionFileList(prev => [...prev, fileObj])} />
          </Form.Item>

          <Form.Item name="due_date" label="Updated Deadline"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
          
          <Divider orientation="left">Automated Reminders</Divider>
          <Form.List name="reminders">
             {(fields, { add, remove }) => (
               <>{fields.map(({ key, name, ...restField }) => (
                   <Card size="small" key={key} style={{ marginBottom: 8, backgroundColor: '#f9f9f9' }}>
                     <Flex gap="small" align="flex-end">
                       <Form.Item {...restField} name={[name, 'channel']} label="Channels" rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one channel' }]} style={{ margin: 0, width: 200 }}><Select mode="multiple" options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_value']} label="Every" style={{ margin: 0, width: 80 }}><Input type="number" min={1} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 110 }}><Select options={[{value: 'HOURS', label: 'Hours'}, {value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear /></Form.Item>
                       <Button danger onClick={() => remove(name)}>X</Button>
                     </Flex>
                   </Card>
                 ))}
                 <Button type="dashed" onClick={() => add()} block icon={<ClockCircleOutlined />}>Add Scheduled Reminder</Button>
               </>
             )}
          </Form.List>
        </Form>
      </Modal>

      {/* TASK DRAWER */}
      <TaskDetailsDrawer
        open={isDrawerOpen}
        onClose={() => { purgeUnsavedFiles(drawerFileList); setDrawerFileList([]); setIsDrawerOpen(false); }}
        selectedTask={selectedTask}
        taskDetails={taskDetails}
        user={user}
        showReminders
        extra={
          <Flex gap="small">
            {selectedTask?.status === 'OPEN' ? (
              selectedTask?.review_status === 'PENDING' ? (
                <>
                  <Button onClick={openActionModal} style={{ background: 'transparent', border: '1px solid #B3455C', color: '#B3455C' }}>Reject</Button>
                  <Popconfirm title="Approve and close this task?" onConfirm={handleApprove}>
                    <Button style={{ backgroundColor: '#B3455C', border: 'none', color: '#FFFFFF' }}>Approve</Button>
                  </Popconfirm>
                </>
              ) : (
                <>
                  <Button
                    icon={<EditOutlined />}
                    onClick={openEditModal}
                    style={{ background: 'transparent', border: '1px solid rgba(24, 24, 27, 0.15)', color: '#18181B' }}
                  >
                    Edit
                  </Button>
                  <Popconfirm title="Force close task?" onConfirm={() => changeTaskStatus('CLOSED')}>
                    <Button style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}>Close Task</Button>
                  </Popconfirm>
                </>
              )
            ) : (
              <Button type="primary" onClick={openActionModal}>Reopen Task</Button>
            )}
          </Flex>
        }
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