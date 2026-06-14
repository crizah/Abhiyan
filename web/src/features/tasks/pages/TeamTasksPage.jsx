import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Drawer, Select, message, Modal, Input, Form, DatePicker, Space, Timeline, Divider, Popconfirm } from 'antd';
import { PlusOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined, InfoCircleOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function TeamTasksPage() {
  const [form] = Form.useForm();
  
  // Data State
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  // UI State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  
  // Task Feed State
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [newUpdateText, setNewUpdateText] = useState('');

  // --- INITIALIZATION ---
  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (activeTeamId) {
      fetchTasks(activeTeamId);
      fetchTeamMembers(activeTeamId);
    } else {
      setTasks([]);
      setTeamMembers([]);
    }
  }, [activeTeamId]);

const fetchTeams = async () => {
    try {
    
      const res = await apiClient.get('/admin/my-teams'); 
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(res.data[0].id);
    } catch (err) {
      message.error("Failed to load teams.");
    }
  };

  const fetchTasks = async (teamId) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/admin/teams/${teamId}/tasks`);
      setTasks(res.data || []);
    } catch (err) {
      message.error("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const res = await apiClient.get(`/admin/teams/${teamId}/members`);
      setTeamMembers(res.data || []);
    } catch (err) {
      message.error("Failed to load team directory for assignments.");
    }
  };

  // --- TASK CREATION ---
  const handleCreateTask = async (values) => {
    try {
      // Format dates and prepare payload
      const payload = {
        team_id: activeTeamId,
        title: values.title,
        description: values.description,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        assignee_ids: values.assignees,
        subscriber_ids: values.subscribers || [],
        reminders: (values.reminders || []).map(r => ({
          channel: r.channel,
          scheduled_at: r.scheduled_at.toISOString(),
          recurrence_value: r.recurrence_value ? parseInt(r.recurrence_value) : undefined,
          recurrence_unit: r.recurrence_unit || undefined
        }))
      };

      await apiClient.post(`/admin/teams/${activeTeamId}/tasks`, payload);
      message.success("Task created and assigned successfully!");
      setIsCreateModalOpen(false);
      form.resetFields();
      fetchTasks(activeTeamId);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to create task");
    }
  };

  // --- TASK DRAWER & UPDATES ---
  const openTaskDrawer = async (task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
    fetchTaskUpdates(task.id);
  };

  const fetchTaskUpdates = async (taskId) => {
    try {
      // Assuming you will wire up a quick GET /tasks/:id/updates endpoint
      const res = await apiClient.get(`/admin/tasks/${taskId}/updates`);
      setTaskUpdates(res.data || []);
    } catch (err) {
      message.error("Failed to load task history.");
    }
  };

  const postTaskUpdate = async () => {
    if (!newUpdateText.trim()) return;
    try {
      // Assuming a POST /tasks/:id/updates endpoint
      await apiClient.post(`/admin/tasks/${selectedTask.id}/updates`, { content: newUpdateText });
      setNewUpdateText('');
      fetchTaskUpdates(selectedTask.id);
    } catch (err) {
      message.error("Failed to post update.");
    }
  };

  const changeTaskStatus = async (newStatus) => {
    try {
      await apiClient.put(`/admin/tasks/${selectedTask.id}/status`, { status: newStatus });
      message.success(`Task marked as ${newStatus}`);
      setIsDrawerOpen(false);
      fetchTasks(activeTeamId);
    } catch (err) {
      message.error("Failed to update status.");
    }
  };

  // --- TABLE CONFIG ---
  const columns = [
    { title: 'Task', dataIndex: 'title', key: 'title', render: text => <Text strong>{text}</Text> },
    { 
      title: 'Due Date', dataIndex: 'due_date', key: 'due_date', 
      render: date => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">No deadline</Text>
    },
    { 
      title: 'Fulfillment', dataIndex: 'fulfillment_status', key: 'fulfillment',
      render: status => <Tag color={status === 'COMPLETED' ? 'success' : 'processing'}>{status}</Tag>
    },
    { 
      title: 'Admin Status', dataIndex: 'status', key: 'status',
      render: status => <Tag color={status === 'CLOSED' ? 'default' : 'error'}>{status}</Tag>
    },
    { 
      title: 'Action', key: 'action', width: 120,
      render: (_, record) => (
        <Button type="primary" size="small" onClick={() => openTaskDrawer(record)}>
          View details
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: '24px' }}>
        <Title level={3} style={{ margin: 0 }}>Task Management</Title>
        <Flex gap="small">
          <Select 
            value={activeTeamId} 
            onChange={setActiveTeamId} 
            style={{ width: 200 }}
            options={teams.map(t => ({ label: t.name, value: t.id }))}
            placeholder="Select a Team"
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)} disabled={!activeTeamId}>
            Assign New Task
          </Button>
        </Flex>
      </Flex>

      <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} />
      </Card>

      {/* --- CREATE TASK MODAL --- */}
      <Modal 
        title="Assign New Task" open={isCreateModalOpen} 
        onCancel={() => setIsCreateModalOpen(false)} width={700}
        footer={[
          <Button key="back" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>,
          <Button key="submit" type="primary" onClick={() => form.submit()}>Create Task</Button>
        ]}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateTask}>
          <Form.Item name="title" label="Task Title" rules={[{ required: true }]}>
            <Input placeholder="e.g. Q3 Financial Audit" size="large" />
          </Form.Item>
          
          <Form.Item name="description" label="Detailed Description">
            <TextArea rows={3} placeholder="Explain the deliverables..." />
          </Form.Item>

          <Flex gap="middle">
            <Form.Item name="assignees" label="Assign To (Required)" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select mode="multiple" placeholder="Select team members" options={teamMembers.map(m => ({ label: m.full_name, value: m.id }))} />
            </Form.Item>
            <Form.Item name="subscribers" label="Keep in Loop (Subscribers)" style={{ flex: 1 }}>
              <Select mode="multiple" placeholder="Select viewers" options={teamMembers.map(m => ({ label: m.full_name, value: m.id }))} />
            </Form.Item>
          </Flex>

          <Form.Item name="due_date" label="Hard Deadline">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Divider orientation="left">Automated Reminders</Divider>
          
          <Form.List name="reminders">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card size="small" key={key} style={{ marginBottom: 8, backgroundColor: '#f9f9f9' }}>
                    <Flex gap="small" align="flex-end">
                      <Form.Item {...restField} name={[name, 'channel']} label="Channel" rules={[{ required: true }]} style={{ margin: 0, width: 120 }}>
                        <Select options={[{value: 'EMAIL', label: 'Email'}, {value: 'WHATSAPP', label: 'WhatsApp'}]} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'scheduled_at']} label="First Alert" rules={[{ required: true }]} style={{ margin: 0, flex: 1 }}>
                        <DatePicker showTime style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'recurrence_value']} label="Repeat Every" style={{ margin: 0, width: 100 }}>
                        <Input type="number" min={1} placeholder="e.g. 2" />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'recurrence_unit']} label="Unit" style={{ margin: 0, width: 120 }}>
                        <Select options={[{value: 'DAYS', label: 'Days'}, {value: 'WEEKS', label: 'Weeks'}, {value: 'MONTHS', label: 'Months'}]} allowClear />
                      </Form.Item>
                      <Button danger onClick={() => remove(name)}>Remove</Button>
                    </Flex>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<ClockCircleOutlined />}>
                  Add Scheduled Reminder
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* --- TASK DETAIL DRAWER --- */}
      <Drawer
        title={selectedTask?.title || "Task Details"} placement="right" width={600}
        onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen}
        extra={
          selectedTask?.status === 'OPEN' && (
            <Popconfirm title="Close this task?" description="This marks the task as completely finalized." onConfirm={() => changeTaskStatus('CLOSED')}>
              <Button type="primary" danger>Close Task</Button>
            </Popconfirm>
          )
        }
      >
        {selectedTask && (
          <Flex vertical gap="large" style={{ height: '100%' }}>
            
            {/* META DATA SECTION */}
            <Card size="small" style={{ backgroundColor: '#f5f5f5', border: 'none' }}>
              <Paragraph style={{ margin: 0 }}>{selectedTask.description || <Text type="secondary" italic>No description provided.</Text>}</Paragraph>
              <Divider style={{ margin: '12px 0' }} />
              <Flex justify="space-between">
                <Text><InfoCircleOutlined /> Status: <Tag color={selectedTask.status === 'CLOSED' ? 'default' : 'blue'}>{selectedTask.status}</Tag></Text>
                <Text><CheckCircleOutlined /> Fulfillment: <Tag color={selectedTask.fulfillment_status === 'COMPLETED' ? 'success' : 'processing'}>{selectedTask.fulfillment_status}</Tag></Text>
              </Flex>
            </Card>

            {/* ROADMAP / UPDATES FEED */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Title level={5}>Activity & Updates</Title>
              {taskUpdates.length === 0 ? (
                <Text type="secondary">No updates yet. Be the first to add one!</Text>
              ) : (
                <Timeline
                  items={taskUpdates.map(update => ({
                    color: 'blue',
                    children: (
                      <>
                        <Text strong>{update.first_name} {update.last_name}</Text>
                        <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
                          {dayjs(update.created_at).format('MMM D, h:mm A')}
                        </Text>
                        <Paragraph style={{ margin: '4px 0 0 0' }}>{update.content}</Paragraph>
                      </>
                    )
                  }))}
                />
              )}
            </div>

            {/* NEW UPDATE INPUT */}
            {selectedTask.status === 'OPEN' && (
              <Flex gap="small" style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                <Input 
                  placeholder="Type an update or comment..." 
                  value={newUpdateText} 
                  onChange={(e) => setNewUpdateText(e.target.value)}
                  onPressEnter={postTaskUpdate}
                />
                <Button type="primary" icon={<SendOutlined />} onClick={postTaskUpdate} disabled={!newUpdateText.trim()}>
                  Post
                </Button>
              </Flex>
            )}
          </Flex>
        )}
      </Drawer>
    </div>
  );
}