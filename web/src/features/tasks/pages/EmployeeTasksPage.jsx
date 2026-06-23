import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Table, Input, Flex, Tag, Drawer, Select, message, Timeline, Divider, Popconfirm, Mentions, Tabs, Upload, List } from 'antd';
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

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTasks, setTotalTasks] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [newUpdateText, setNewUpdateText] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [drawerFileList, setDrawerFileList] = useState([]);

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
      
      // Update tasks and total count based on backend response
      setTasks(res.data.tasks || res.data || []);
      setTotalTasks(res.data.total_count || 0); 
    } catch (err) { 
      message.error("Failed to load your tasks."); 
    } finally { 
      setLoading(false); 
    }
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
      message.success(`Task submitted for verification!`);
      
      // Optimistic update
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, fulfillment_status: 'COMPLETED', review_status: 'PENDING' } : t));
      setSelectedTask(prev => ({ ...prev, fulfillment_status: 'COMPLETED', review_status: 'PENDING' }));
      
      fetchTaskUpdates(selectedTask.id);
      setIsDrawerOpen(false);
    } catch (err) { message.error("Submission failed."); }
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
    } catch (err) { message.error("Update publication dropped."); }
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
    } catch (err) { message.error("Failed to post comment"); }
  };

  const baseColumns = [
    { title: 'Task Name', dataIndex: 'title', render: text => <Text strong>{text}</Text> },
    { title: 'Due Date', dataIndex: 'due_date', render: d => d ? dayjs(d).format('MMM D, YYYY') : 'None' },
    { title: 'Progress', dataIndex: 'fulfillment_status', render: s => <Tag color="orange">{s}</Tag> },
    { title: 'View Workspace', render: (_, r) => <Button size="small" onClick={() => openTaskDrawer(r)}>Open</Button> }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <Title level={3}>My Workspace Terminal</Title>
        <Select value={activeTeamId} onChange={setActiveTeamId} style={{ width: 250 }} options={teams.map(t => ({ label: t.name, value: t.id }))} />
      </Flex>
      
      <Card>
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

      <Drawer title="Execution Loop Window" width={650} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen}
        extra={selectedTask?.status === 'OPEN' && selectedTask?.fulfillment_status !== 'COMPLETED' && (
          <Popconfirm title="Submit verification request?" onConfirm={submitTaskForReview}>
            <Button type="primary">Submit Deliverable Bundle</Button>
          </Popconfirm>
        )}
      >
        {selectedTask && (
          <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="Context Information" key="1">
              <Paragraph>{selectedTask.description}</Paragraph>
              {taskDetails?.attachments && (
                <List dataSource={taskDetails.attachments} renderItem={file => (
                  <List.Item><a href={file.file_url} target="_blank" rel="noreferrer">{file.file_name}</a></List.Item>
                )} />
              )}
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="Updates Engine" key="2">
              <div style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <Timeline items={taskUpdates.map(u => ({
                    children: (
                      <div>
                        <Text strong>{u.first_name}: </Text><span>{u.content}</span>
                        {u.attachments?.map((f, i) => (
                          <div key={i} style={{ marginBottom: 8 }}>
                            {f.file_type.includes('audio') ? <audio controls src={f.file_url} style={{ height: 26 }} /> : <Tag><a href={f.file_url} target="_blank" rel="noreferrer">{f.file_name}</a></Tag>}
                          </div>
                        ))}
                        <div style={{ backgroundColor: '#fafafa', padding: '8px', borderRadius: '6px', border: '1px solid #f0f0f0', marginTop: 8 }}>
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
                                  <Mentions style={{ flex: 1 }} size="small" placeholder="Write a comment..." value={commentDrafts[u.id] || ''} onChange={val => setCommentDrafts({...commentDrafts, [u.id]: val})} options={teamMembers.map(m => ({value: m.full_name.replace(/\s+/g, ''), label: m.full_name}))} />
                                  <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => postComment(u.id)} disabled={!commentDrafts[u.id]?.trim()}>Reply</Button>
                                </Flex>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  }))} />
                </div>
                <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
                  {drawerFileList.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      {drawerFileList.map(f => <Tag key={f.uid} closable onClose={() => setDrawerFileList(prev => prev.filter(x => x.uid !== f.uid))}>{f.name}</Tag>)}
                    </div>
                  )}
                  <Flex gap="small">
                    <Upload customRequest={handleS3UploadWithPurge} fileList={drawerFileList} onChange={({fileList}) => setDrawerFileList(fileList)} showUploadList={false} multiple>
                      <Button icon={<PaperClipOutlined />} />
                    </Upload>
                    <AudioRecorder onUploadSuccess={(fileObj) => setDrawerFileList(prev => [...prev, fileObj])} />
                    <Input value={newUpdateText} onChange={e => setNewUpdateText(e.target.value)} placeholder="Type completion notes..." />
                    <Button type="primary" onClick={postTaskUpdate}>Update</Button>
                  </Flex>
                </div>
              </div>
            </Tabs.TabPane>
          </Tabs>
        )}
      </Drawer>
    </div>
  );
}