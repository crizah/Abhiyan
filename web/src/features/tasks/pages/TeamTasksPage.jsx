import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Drawer, Select, message, Modal, Input, Form, DatePicker, Timeline, Divider, Popconfirm, Mentions, Tabs, Upload, List, Image } from 'antd';
import { PlusOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined, InfoCircleOutlined, EditOutlined, CommentOutlined, PaperClipOutlined, AudioOutlined, DownloadOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios';
import { uploadFileToS3 } from '../../../utils/S3Upload';
import { AudioRecorder } from '../../../components/AudioRecorder';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

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

function UpdateComposer({ drawerFileList, setDrawerFileList, onPostUpdate, mentionOptions, handleS3UploadWithPurge }) {
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
            <Tag closable onClose={() => setDrawerFileList(drawerFileList.filter(item => item.uid !== f.uid))} key={f.uid}>
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

export default function TeamTasksPage() {
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
      const s3Metadata = await uploadFileToS3(file, onProgress);
      file.s3Data = s3Metadata;
      onSuccess("OK");
    } catch (err) {
      onError(err);
      setterFunc(prev => prev.filter(item => item.uid !== file.uid));
    }
  };

  const getS3Attachments = (list) => list.filter(f => f.status === 'done' && f.s3Data).map(f => f.s3Data);

  const handleCreateTask = async (values) => {
    try {
      const payload = {
        team_id: activeTeamId, title: values.title, description: values.description,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        assignee_ids: values.assignees, subscriber_ids: values.subscribers || [],
        reminders: (values.reminders || []).map(r => ({
          channel: r.channel, scheduled_at: r.scheduled_at.toISOString(),
          recurrence_value: r.recurrence_value ? parseInt(r.recurrence_value) : undefined,
          recurrence_unit: r.recurrence_unit || undefined
        })),
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

  const openEditModal = () => {
    editForm.setFieldsValue({
      title: selectedTask.title, description: selectedTask.description,
      due_date: selectedTask.due_date ? dayjs(selectedTask.due_date) : null,
      assignees: (taskDetails?.participants || []).filter(p => p.role === 'ASSIGNEE').map(p => p.id),
      subscribers: (taskDetails?.participants || []).filter(p => p.role === 'SUBSCRIBER').map(p => p.id),
      reminders: (taskDetails?.reminders || []).map(r => ({
        channel: r.channel, scheduled_at: dayjs(r.scheduled_at),
        recurrence_value: r.recurrence_value, recurrence_unit: r.recurrence_unit
      }))
    });
    setEditFileList((taskDetails?.attachments || []).map(att => ({
      uid: att.file_url, name: att.file_name, status: 'done', url: att.file_url,
      s3Data: { file_name: att.file_name, file_url: att.file_url, file_type: att.file_type, file_size: att.file_size }
    })));
    setIsEditModalOpen(true);
  };

  const handleEditTask = async (values) => {
    try {
      const payload = {
        title: values.title, description: values.description,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        assignee_ids: values.assignees, subscriber_ids: values.subscribers || [],
        reminders: (values.reminders || []).map(r => ({
          channel: r.channel, scheduled_at: r.scheduled_at.toISOString(),
          recurrence_value: r.recurrence_value ? parseInt(r.recurrence_value) : undefined,
          recurrence_unit: r.recurrence_unit || undefined
        })),
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
      reminders: (taskDetails?.reminders || []).map(r => ({
        channel: r.channel, scheduled_at: dayjs(r.scheduled_at),
        recurrence_value: r.recurrence_value, recurrence_unit: r.recurrence_unit
      }))
    });
    setActionFileList([]);
    setIsActionModalOpen(true);
  };

  const handleActionTask = async (values) => {
    try {
      const payload = {
        note: values.note, due_date: values.due_date ? values.due_date.toISOString() : null,
        reminders: (values.reminders || []).map(r => ({ 
          channel: r.channel, scheduled_at: r.scheduled_at.toISOString(),
          recurrence_value: r.recurrence_value ? parseInt(r.recurrence_value, 10) : undefined,
          recurrence_unit: r.recurrence_unit || undefined
        })),
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

  const postComment = async (updateId, text) => {
    try {
      const mentionedIds = teamMembers.filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/admin/tasks/${selectedTask.id}/updates/${updateId}/comments`, {
        content: text,
        mentioned_user_ids: mentionedIds
      });
      setCommentOffsets(prev => ({ ...prev, [updateId]: 0 }));
      fetchComments(selectedTask.id, updateId, 0);
      setTaskUpdates(prev => prev.map(u => u.id === updateId ? { ...u, comment_count: u.comment_count + 1 } : u));
      window.dispatchEvent(new Event('refresh-notifications'));
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
  const columns = activeTeamId === 'ALL' ? [{ title: 'Team', dataIndex: 'team_name', key: 'team_name', render: text => <Tag color="geekblue">{text}</Tag> }, ...baseColumns] : baseColumns;

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
      <Modal destroyOnClose title="Assign New Task" open={isCreateModalOpen} onCancel={() => setIsCreateModalOpen(false)} width={700} footer={[<Button key="back" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => form.submit()}>Create Task</Button>]}>
        <Form form={form} layout="vertical" onFinish={handleCreateTask}>
          <Form.Item name="title" label="Task Title" rules={[{ required: true }]}><Input size="large" /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>
          
          <Form.Item label="Attachments">
            <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setCreateFileList)} fileList={createFileList} onChange={({fileList}) => setCreateFileList(fileList)} multiple>
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
                       <Form.Item {...restField} name={[name, 'channel']} label="Channel" rules={[{ required: true }]} style={{ margin: 0, width: 120 }}><Select options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_value']} label="Every" style={{ margin: 0, width: 80 }}><Input type="number" min={1} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 110 }}><Select options={[{value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear /></Form.Item>
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
      <Modal destroyOnClose title="Edit Task Details" open={isEditModalOpen} onCancel={() => setIsEditModalOpen(false)} width={700} footer={[<Button key="back" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => editForm.submit()}>Save Changes</Button>]}>
        <Form form={editForm} layout="vertical" onFinish={handleEditTask}>
          <Form.Item name="title" label="Task Title" rules={[{ required: true }]}><Input size="large" /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>
          
          <Form.Item label="Task Attachments">
            <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setEditFileList)} fileList={editFileList} onChange={({fileList}) => setEditFileList(fileList)} multiple>
              <Button icon={<PaperClipOutlined />}>Add Files</Button>
            </Upload>
            <Divider style={{ margin: '8px 0' }} />
            <AudioRecorder onUploadSuccess={(fileObj) => setEditFileList(prev => [...prev, fileObj])} />
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
                       <Form.Item {...restField} name={[name, 'channel']} label="Channel" rules={[{ required: true }]} style={{ margin: 0, width: 120 }}><Select options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_value']} label="Every" style={{ margin: 0, width: 80 }}><Input type="number" min={1} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 110 }}><Select options={[{value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear /></Form.Item>
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
      <Modal destroyOnClose title={selectedTask?.status === 'CLOSED' ? "Reopen Task" : "Reject Task"} open={isActionModalOpen} onCancel={() => setIsActionModalOpen(false)} width={700} footer={[<Button key="back" onClick={() => setIsActionModalOpen(false)}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => actionForm.submit()}>{selectedTask?.status === 'CLOSED' ? "Confirm Reopen" : "Confirm Rejection"}</Button>]}>
        <Form form={actionForm} layout="vertical" onFinish={handleActionTask}>
          <Form.Item name="note" label="Action Note (Optional)"><TextArea rows={2} /></Form.Item>
          
          <Form.Item label="Attach Evidence/Voice Explanations">
            <Upload customRequest={(opt) => handleS3UploadWithPurge(opt, setActionFileList)} fileList={actionFileList} onChange={({fileList}) => setActionFileList(fileList)} multiple>
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
                       <Form.Item {...restField} name={[name, 'channel']} label="Channel" rules={[{ required: true }]} style={{ margin: 0, width: 120 }}><Select options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_value']} label="Every" style={{ margin: 0, width: 80 }}><Input type="number" min={1} /></Form.Item>
                       <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 110 }}><Select options={[{value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear /></Form.Item>
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

      {/* RESTORED DRAWER */}
      <Drawer title={selectedTask?.title || "Task Details"} placement="right" width={700} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen}
        extra={
          <Flex gap="small">
            {selectedTask?.status === 'OPEN' ? (
              selectedTask?.review_status === 'PENDING' ? (
                <>
                  <Button danger onClick={openActionModal}>Reject</Button>
                  <Popconfirm title="Approve and close this task?" onConfirm={handleApprove}>
                    <Button type="primary" style={{ backgroundColor: '#52c41a' }}>Approve</Button>
                  </Popconfirm>
                </>
              ) : (
                <>
                  <Button icon={<EditOutlined />} onClick={openEditModal}>Edit</Button>
                  <Popconfirm title="Force close task?" onConfirm={() => changeTaskStatus('CLOSED')}>
                    <Button type="primary" danger>Close Task</Button>
                  </Popconfirm>
                </>
              )
            ) : (
              <Button type="primary" onClick={openActionModal}>Reopen Task</Button>
            )}
          </Flex>
        }
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
                {taskDetails && (
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Assignees: {taskDetails.participants.filter(p => p.role === 'ASSIGNEE').map(p => p.full_name).join(', ')}</Text><br/>
                    <Text type="secondary" style={{ fontSize: 12 }}>Reminders: {taskDetails.reminders?.length || 0}</Text>
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
                        extra={<Button icon={<DownloadOutlined />} type="text" onClick={() => handleDownload(file.file_url, file.file_name)} title="Download" />}
                      >
                        <List.Item.Meta
                          avatar={file.file_type.startsWith('audio/') ? <AudioOutlined style={{ fontSize: 24, color: '#1890ff' }}/> : <PaperClipOutlined style={{ fontSize: 24 }} />}
                          title={<a href={file.file_url} target="_blank" rel="noreferrer">{file.file_name}</a>}
                          description={file.file_type.startsWith('audio/') ? <audio controls src={file.file_url} style={{ height: 30, marginTop: 8 }} /> : `${(file.file_size / 1024).toFixed(2)} KB`}
                        />
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
                                  <Flex gap="small" align="center">
                                    <audio controls src={file.file_url} style={{ height: 30 }} />
                                    <Button icon={<DownloadOutlined />} size="small" type="text" onClick={() => handleDownload(file.file_url, file.file_name)} />
                                  </Flex>
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
                                    <CommentInput updateId={u.id} onSubmit={postComment} mentionOptions={cachedMentionOptions} />
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