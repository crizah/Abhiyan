import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Table, Flex, Tag, Drawer, Select, message, Timeline, Divider, Popconfirm, Mentions, Tabs, Upload, List } from 'antd';
import { SendOutlined, InfoCircleOutlined, CheckCircleOutlined, CommentOutlined, PaperClipOutlined, AudioOutlined } from '@ant-design/icons';
import apiClient from '../../../config/axios'; 
import { uploadFileToS3 } from '../../../utils/S3Upload';
import { AudioRecorder } from '../../../components/AudioRecorder';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

export default function EmployeeTasksPage() {
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [newUpdateText, setNewUpdateText] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [drawerFileList, setDrawerFileList] = useState([]);

  useEffect(() => { fetchTeams(); }, []);
  useEffect(() => {
    if (activeTeamId) {
      fetchTasks(activeTeamId);
      apiClient.get(`teams/${activeTeamId}/members`).then(res => setTeamMembers(res.data || [])).catch(() => {});
    } else {
      setTasks([]);
      setTeamMembers([]);
    }
  }, [activeTeamId]);

  const fetchTeams = async () => {
    try {
      const res = await apiClient.get('/employee/teams'); 
      setTeams(res.data || []);
      if (res.data?.length > 0) setActiveTeamId(res.data[0].id);
    } catch (err) { message.error("Failed to load your teams."); }
  };

  const fetchTasks = async (teamId) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/employee/teams/${teamId}/tasks`);
      setTasks(res.data || []);
    } catch (err) { message.error("Failed to load your tasks."); } 
    finally { setLoading(false); }
  };

  const handleS3UploadWithPurge = async (options) => {
    const { file, onSuccess, onError, onProgress } = options;
    try {
      const s3Metadata = await uploadFileToS3(file, onProgress);
      file.s3Data = s3Metadata;
      onSuccess("OK");
    } catch (err) {
      onError(err);
      setDrawerFileList(prev => prev.filter(item => item.uid !== file.uid));
    }
  };

  const openTaskDrawer = async (task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
    setDrawerFileList([]);
    fetchTaskUpdates(task.id);
    try {
      const res = await apiClient.get(`/admin/tasks/${task.id}/details`);
      setTaskDetails(res.data);
    } catch(err) {}
  };

  const fetchTaskUpdates = async (taskId) => {
    try {
      const res = await apiClient.get(`/tasks/${taskId}/updates`);
      setTaskUpdates(res.data || []);
    } catch (err) {}
  };

  const submitTaskForReview = async () => {
    try {
      await apiClient.put(`/employee/tasks/${selectedTask.id}/submit`);
      message.success(`Task submitted to Admin for review!`);
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, fulfillment_status: 'COMPLETED', review_status: 'PENDING' } : t));
      setSelectedTask(prev => ({ ...prev, fulfillment_status: 'COMPLETED', review_status: 'PENDING' }));
      fetchTaskUpdates(selectedTask.id); 
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to submit task."); }
  };

  const postTaskUpdate = async () => {
    if (!newUpdateText.trim() && drawerFileList.length === 0) return;
    try {
      const mentionedIds = teamMembers.filter(m => newUpdateText.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      
      await apiClient.post(`/tasks/${selectedTask.id}/updates`, { 
        content: newUpdateText,
        mentioned_user_ids: mentionedIds,
        attachments: drawerFileList.filter(f => f.status === 'done' && f.s3Data).map(f => f.s3Data)
      });
      
      setNewUpdateText('');
      setDrawerFileList([]);
      fetchTaskUpdates(selectedTask.id);
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to post update."); }
  };

  const postComment = async (updateId) => {
    const text = commentDrafts[updateId];
    if (!text?.trim()) return;
    try {
      const mentionedIds = teamMembers.filter(m => text.includes(`@${m.full_name.replace(/\s+/g, '')}`)).map(m => m.id);
      await apiClient.post(`/tasks/${selectedTask.id}/updates/${updateId}/comments`, { 
        content: text,
        mentioned_user_ids: mentionedIds 
      });
      setCommentDrafts(prev => ({ ...prev, [updateId]: '' }));
      fetchTaskUpdates(selectedTask.id);
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (err) { message.error("Failed to post comment"); }
  };

  const columns = [
    { title: 'Task', dataIndex: 'title', key: 'title', render: text => <Text strong>{text}</Text> },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: date => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">No deadline</Text> },
    { title: 'My Progress', dataIndex: 'fulfillment_status', key: 'fulfillment', render: status => <Tag color={status === 'COMPLETED' ? 'success' : 'processing'}>{status}</Tag> },
    { title: 'Task Status', dataIndex: 'status', key: 'status', render: status => <Tag color={status === 'CLOSED' ? 'default' : status === 'FAILED' ? 'error' : 'blue'}>{status}</Tag> },
    { title: 'Admin Review', dataIndex: 'review_status', key: 'review', render: status => <Tag color={status === 'APPROVED' ? 'gold' : status === 'REJECTED' ? 'error' : status === 'PENDING' ? 'purple' : 'default'}>{status}</Tag> },
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
        <Title level={3} style={{ margin: 0 }}>My Tasks</Title>
        <Select value={activeTeamId} onChange={setActiveTeamId} style={{ width: 250 }} options={teams.map(t => ({ label: t.name, value: t.id }))} placeholder="Select a Team Workspace" />
      </Flex>

      <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} />
      </Card>

      <Drawer title={selectedTask?.title || "Task Workspace"} placement="right" width={700} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen}
        extra={
          selectedTask?.status === 'OPEN' && selectedTask?.fulfillment_status !== 'COMPLETED' && selectedTask?.review_status !== 'PENDING' && (
            <Popconfirm title="Submit this task to Admin for review?" onConfirm={submitTaskForReview}>
              <Button type="primary" icon={<CheckCircleOutlined />}>Submit for Review</Button>
            </Popconfirm>
          )
        }
      >
        {selectedTask && (
          <Tabs defaultActiveKey="1" style={{ height: '100%' }}>
            {/* RESTORED OVERVIEW */}
            <Tabs.TabPane tab="Overview" key="1">
              <Card size="small" style={{ backgroundColor: '#f5f5f5', border: 'none', marginBottom: 16 }}>
                <Paragraph style={{ margin: 0 }}>{selectedTask.description || <Text type="secondary" italic>No description provided.</Text>}</Paragraph>
                <Divider style={{ margin: '12px 0' }} />
                <Flex justify="space-between">
                  <Text><InfoCircleOutlined /> Task Status: <Tag color={selectedTask.status === 'CLOSED' ? 'default' : 'blue'}>{selectedTask.status}</Tag></Text>
                  <Text><CheckCircleOutlined /> My Progress: <Tag color={selectedTask.fulfillment_status === 'COMPLETED' ? 'success' : 'processing'}>{selectedTask.fulfillment_status}</Tag></Text>
                </Flex>
                <Flex justify="space-between" style={{ marginTop: 12 }}>
                  <Text><InfoCircleOutlined /> Admin Review: <Tag color={selectedTask.review_status === 'APPROVED' ? 'gold' : selectedTask.review_status === 'REJECTED' ? 'error' : selectedTask.review_status === 'PENDING' ? 'purple' : 'default'}>{selectedTask.review_status}</Tag></Text>
                </Flex>
                {taskDetails && (
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Team Assignees: {taskDetails.participants.filter(p => p.role === 'ASSIGNEE').map(p => p.full_name).join(', ')}</Text>
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
                      <List.Item>
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

            {/* RESTORED TIMELINE WITH COMMENTS */}
            <Tabs.TabPane tab="Activity & Updates" key="2">
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
                  {taskUpdates.length === 0 ? <Text type="secondary">No activity yet.</Text> : (
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
                                   <audio controls src={file.file_url} style={{ height: 30 }} />
                                 ) : (
                                   <Tag icon={<PaperClipOutlined />}><a href={file.file_url} target="_blank" rel="noreferrer">{file.file_name}</a></Tag>
                                 )}
                               </div>
                            ))}
                            
                            {/* FULLY RESTORED COMMENTS SECTION */}
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
                                    <Flex gap="small" style={{ marginTop: '8px' }}>
                                      <Mentions 
                                        style={{ flex: 1 }}
                                        size="small" placeholder="Write a comment... use @ to mention" 
                                        value={commentDrafts[u.id] || ''} 
                                        onChange={value => setCommentDrafts({...commentDrafts, [u.id]: value})}
                                        onPressEnter={(e) => {
                                          if (!e.shiftKey) {
                                            e.preventDefault();
                                            postComment(u.id);
                                          }
                                        }}
                                        options={teamMembers.map(m => ({
                                          value: m.full_name.replace(/\s+/g, ''),
                                          label: m.full_name
                                        }))}
                                      />
                                      <Button 
                                        type="primary" 
                                        size="small" 
                                        icon={<SendOutlined />} 
                                        onClick={() => postComment(u.id)}
                                        disabled={!commentDrafts[u.id]?.trim()}
                                      >
                                        Reply
                                      </Button>
                                    </Flex>
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
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                    {drawerFileList.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {drawerFileList.map(f => <Tag closable onClose={() => setDrawerFileList(drawerFileList.filter(item => item.uid !== f.uid))} key={f.uid}>{f.name}</Tag>)}
                      </div>
                    )}
                    <Flex gap="small" align="center">
                      <Upload customRequest={(opt) => handleS3UploadWithPurge(opt)} fileList={drawerFileList} onChange={({fileList}) => setDrawerFileList(fileList)} showUploadList={false} multiple>
                        <Button icon={<PaperClipOutlined />} />
                      </Upload>
                      <AudioRecorder onUploadSuccess={(fileObj) => setDrawerFileList(prev => [...prev, fileObj])} />

                      {/* RESTORED MENTIONS INPUT FOR MAIN UPDATE */}
                      <Mentions
                        style={{ flex: 1 }}
                        placeholder="Type an update... use @ to mention team members"
                        value={newUpdateText}
                        onChange={setNewUpdateText}
                        options={teamMembers.map(m => ({
                          value: m.full_name.replace(/\s+/g, ''),
                          label: m.full_name
                        }))}
                      />
                      <Button type="primary" icon={<SendOutlined />} onClick={postTaskUpdate} disabled={!newUpdateText.trim() && drawerFileList.length === 0}>Post</Button>
                    </Flex>
                  </div>
                )}
              </div>
            </Tabs.TabPane>
          </Tabs>
        )}
      </Drawer>
    </div>
  );
}