import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Drawer, Select, message, Modal, Input, Form, DatePicker, Timeline, Divider, Popconfirm, Mentions } from 'antd';
import { PlusOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined, InfoCircleOutlined, EditOutlined, CommentOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function TeamTasksPage() {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [reopenForm] = Form.useForm();
  
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  
  // Timeline State
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [newUpdateText, setNewUpdateText] = useState('');
  
  // Comments State map: { update_id: "Draft comment text" }
  const [commentDrafts, setCommentDrafts] = useState({});
  const [expandedComments, setExpandedComments] = useState({});

  useEffect(() => { fetchTeams(); }, []);

  useEffect(() => {
    if (activeTeamId) {
      fetchTasks(activeTeamId);
      if (activeTeamId !== 'ALL') fetchTeamMembers(activeTeamId);
      else setTeamMembers([]);
    } else {
      setTasks([]);
      setTeamMembers([]);
    }
  }, [activeTeamId]);

  useEffect(() => { form.resetFields(); }, [activeTeamId, form]);

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/admin/my-teams'); 
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(res.data[0].id);
    } catch (err) { message.error("Failed to load teams."); }
  };

  const fetchTasks = async (teamId) => {
    setLoading(true);
    try {
      const endpoint = teamId === 'ALL' ? '/admin/tasks' : `/admin/teams/${teamId}/tasks`;
      const res = await apiClient.get(endpoint);
      setTasks(res.data || []);
    } catch (err) { message.error("Failed to load tasks."); } 
    finally { setLoading(false); }
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const res = await apiClient.get(`/admin/teams/${teamId}/members`);
      setTeamMembers(res.data || []);
    } catch (err) {}
  };

  // --- CRUD Modals ---
  
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
        }))
      };
      await apiClient.post(`/admin/teams/${activeTeamId}/tasks`, payload);
      message.success("Task created!");
      setIsCreateModalOpen(false);
      form.resetFields();
      fetchTasks(activeTeamId);
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
        }))
      };
      await apiClient.put(`/admin/tasks/${selectedTask.id}`, payload);
      message.success("Task updated!");
      setIsEditModalOpen(false);
      fetchTasks(activeTeamId);
      openTaskDrawer(selectedTask);
    } catch (err) { message.error("Failed to update task"); }
  };

  const openReopenModal = () => {
    reopenForm.setFieldsValue({
      note: '', due_date: selectedTask.due_date ? dayjs(selectedTask.due_date) : null,
      reminders: (taskDetails?.reminders || []).map(r => ({
        channel: r.channel, scheduled_at: dayjs(r.scheduled_at),
        recurrence_value: r.recurrence_value, recurrence_unit: r.recurrence_unit
      }))
    });
    setIsReopenModalOpen(true);
  };

  const handleReopenTask = async (values) => {
    try {
      const payload = {
        note: values.note, due_date: values.due_date ? values.due_date.toISOString() : null,
        reminders: (values.reminders || []).map(r => ({
          channel: r.channel, scheduled_at: r.scheduled_at.toISOString(),
          recurrence_value: r.recurrence_value ? parseInt(r.recurrence_value) : undefined,
          recurrence_unit: r.recurrence_unit || undefined
        }))
      };
      await apiClient.put(`/admin/tasks/${selectedTask.id}/reopen`, payload);
      message.success("Task reopened!");
      setIsReopenModalOpen(false);
      
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: 'OPEN' } : t));
      setSelectedTask(prev => ({ ...prev, status: 'OPEN' }));
      window.dispatchEvent(new Event('refresh-notifications'));
      fetchTasks(activeTeamId);
      openTaskDrawer(selectedTask);
    } catch (err) { message.error("Failed to reopen task."); }
  };

  // --- DRAWER & UPDATES ---
  const openTaskDrawer = async (task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
    fetchTaskUpdates(task.id);
    try {
      const res = await apiClient.get(`/admin/tasks/${task.id}/details`);
      setTaskDetails(res.data);
    } catch(err) {}
  };

  const fetchTaskUpdates = async (taskId) => {
    try {
      const res = await apiClient.get(`/admin/tasks/${taskId}/updates`);
      setTaskUpdates(res.data || []);
    } catch (err) { message.error("Failed to load history."); }
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

  // --- MENTIONS & COMMENTS LOGIC ---
  const postTaskUpdate = async () => {
    if (!newUpdateText.trim()) return;
    try {
      // Extract mentioned IDs by matching the display names
      const mentionedIds = teamMembers
        .filter(m => newUpdateText.includes(`@${m.full_name.replace(/\s+/g, '')}`))
        .map(m => m.id);

      await apiClient.post(`/admin/tasks/${selectedTask.id}/updates`, { 
        content: newUpdateText,
        mentioned_user_ids: mentionedIds
      });
      
      setNewUpdateText('');
      fetchTaskUpdates(selectedTask.id);
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to post update."); }
  };

  const postComment = async (updateId) => {
    const text = commentDrafts[updateId];
    if (!text?.trim()) return;
    try {
      // FIX: Extract mentioned IDs similarly to update posting
      const mentionedIds = teamMembers
        .filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`))
        .map(m => m.id);

      // FIX: Include mentioned IDs in the request body
      await apiClient.post(`/admin/tasks/${selectedTask.id}/updates/${updateId}/comments`, { 
        content: text,
        mentioned_user_ids: mentionedIds // <-- NEW PAYLOAD
      });
      
      setCommentDrafts(prev => ({ ...prev, [updateId]: '' }));
      fetchTaskUpdates(selectedTask.id);
      // FIX: Dispatch event for real-time notification update
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to post comment"); }
  };

  // --- RENDERERS ---
  const baseColumns = [
    { title: 'Task', dataIndex: 'title', key: 'title', render: text => <Text strong>{text}</Text> },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: date => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">No deadline</Text> },
    { title: 'Fulfillment', dataIndex: 'fulfillment_status', key: 'fulfillment', render: status => <Tag color={status === 'COMPLETED' ? 'success' : 'processing'}>{status}</Tag> },
    { title: 'Admin Status', dataIndex: 'status', key: 'status', render: status => <Tag color={status === 'CLOSED' ? 'default' : status === 'FAILED' ? 'error' : 'blue'}>{status}</Tag> },
    { title: 'Action', key: 'action', width: 120, render: (_, record) => <Button type="primary" size="small" onClick={() => openTaskDrawer(record)}>View Task</Button> }
  ];
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
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} />
      </Card>

      {/* CREATE MODAL */}
      <Modal destroyOnClose title="Assign New Task" open={isCreateModalOpen} onCancel={() => setIsCreateModalOpen(false)} width={700} footer={[<Button key="back" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => form.submit()}>Create Task</Button>]}>
        <Form form={form} layout="vertical" onFinish={handleCreateTask}>
          <Form.Item name="title" label="Task Title" rules={[{ required: true }]}><Input size="large" /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>
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

      {/* REOPEN MODAL */}
      <Modal destroyOnClose title="Reopen Task" open={isReopenModalOpen} onCancel={() => setIsReopenModalOpen(false)} width={700} footer={[<Button key="back" onClick={() => setIsReopenModalOpen(false)}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => reopenForm.submit()}>Confirm Reopen</Button>]}>
        <Form form={reopenForm} layout="vertical" onFinish={handleReopenTask}>
          <Form.Item name="note" label="Reopen Note (Optional)"><TextArea rows={2} /></Form.Item>
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

      {/* DRAWER */}
      <Drawer title={selectedTask?.title || "Task Details"} placement="right" width={600} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen}
        extra={selectedTask?.status === 'OPEN' ? (
          <Flex gap="small">
            <Button icon={<EditOutlined />} onClick={openEditModal}>Edit</Button>
            <Popconfirm title="Close task?" onConfirm={() => changeTaskStatus('CLOSED')}><Button type="primary" danger>Close Task</Button></Popconfirm>
          </Flex>
        ) : <Button type="primary" onClick={openReopenModal}>Reopen Task</Button>}
      >
        {selectedTask && (
          <Flex vertical gap="large" style={{ height: '100%' }}>
            <Card size="small" style={{ backgroundColor: '#f5f5f5', border: 'none' }}>
              <Paragraph style={{ margin: 0 }}>{selectedTask.description || <Text type="secondary" italic>No description provided.</Text>}</Paragraph>
              <Divider style={{ margin: '12px 0' }} />
              <Flex justify="space-between">
                <Text><InfoCircleOutlined /> Status: <Tag color={selectedTask.status === 'CLOSED' ? 'default' : 'blue'}>{selectedTask.status}</Tag></Text>
                <Text><CheckCircleOutlined /> Fulfillment: <Tag color={selectedTask.fulfillment_status === 'COMPLETED' ? 'success' : 'processing'}>{selectedTask.fulfillment_status}</Tag></Text>
              </Flex>
              {taskDetails && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Assignees: {taskDetails.participants.filter(p => p.role === 'ASSIGNEE').map(p => p.full_name).join(', ')}</Text><br/>
                  <Text type="secondary" style={{ fontSize: 12 }}>Reminders: {taskDetails.reminders?.length || 0}</Text>
                </div>
              )}
            </Card>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Title level={5}>Activity</Title>
              {taskUpdates.length === 0 ? <Text type="secondary">No updates yet.</Text> : (
                <Timeline 
                  items={taskUpdates.map(u => ({ 
                    color: 'blue', 
                    children: (
                      <>
                        <Flex justify="space-between" align="baseline">
                          <Text strong>{u.first_name} {u.last_name}</Text>
                          <Text type="secondary" style={{ fontSize: '11px' }}>{dayjs(u.created_at).format('MMM D, h:mm A')}</Text>
                        </Flex>
                        <Paragraph style={{ margin: '4px 0 8px 0' }}>{u.content}</Paragraph>
                        
                        {/* COMMENTS SECTION */}
                        <div style={{ backgroundColor: '#fafafa', padding: '8px', borderRadius: '6px', border: '1px solid #f0f0f0' }}>
                          <Flex justify="space-between" align="center" style={{ cursor: 'pointer', marginBottom: expandedComments[u.id] ? 8 : 0 }} onClick={() => setExpandedComments(prev => ({ ...prev, [u.id]: !prev[u.id] }))}>
                            <Text type="secondary" style={{ fontSize: 12 }}><CommentOutlined /> {u.comments?.length || 0} Comments</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>{expandedComments[u.id] ? 'Collapse' : 'Reply'}</Text>
                          </Flex>
                          
                          {expandedComments[u.id] && (
                            <>
                              {u.comments?.map(c => (
                                <div key={c.id} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid #e6f7ff' }}>
                                  <Text strong style={{ fontSize: 12 }}>{c.first_name}</Text> <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(c.created_at).format('MMM D, h:mm A')}</Text>
                                  <div style={{ fontSize: 13 }}>{c.content}</div>
                                </div>
                              ))}
                              {selectedTask.status === 'OPEN' && (

                                <Mentions 
                                  size="small" placeholder="Write a comment... use @ to mention" 
                                  value={commentDrafts[u.id] || ''} 
                                  onChange={value => setCommentDrafts({...commentDrafts, [u.id]: value})}
                                  onPressEnter={() => postComment(u.id)}
                                  // FIX: Suggestions logic
                                  options={teamMembers.map(m => ({
                                    value: m.full_name.replace(/\s+/g, ''), // e.g. "@JohnDoe"
                                    label: m.full_name
                                  }))}
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
              <Flex gap="small" style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                <Mentions
                  style={{ width: '100%' }}
                  placeholder="Type an update... use @ to mention team members"
                  value={newUpdateText}
                  onChange={setNewUpdateText}
                  options={teamMembers.map(m => ({
                    value: m.full_name.replace(/\s+/g, ''), // e.g. "@JohnDoe"
                    label: m.full_name
                  }))}
                />
                <Button type="primary" icon={<SendOutlined />} onClick={postTaskUpdate} disabled={!newUpdateText.trim()}>Post</Button>
              </Flex>
            )}
          </Flex>
        )}
      </Drawer>
    </div>
  );
}