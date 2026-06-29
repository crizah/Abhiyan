import React, { useState, useEffect } from 'react';
import {
  Table, Select, DatePicker, Button, Tag, Flex, Typography,
  Drawer, Statistic, Row, Col, message, theme, Divider, Avatar
} from 'antd';
import {
  DownloadOutlined, UserOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../config/axios';

const { Title, Text } = Typography;

const STATUS_TAG = {
  present: <Tag color="success">Present</Tag>,
  absent:  <Tag color="error">Absent</Tag>,
};


export default function AttendancePage() {
  const { token } = theme.useToken();

  const [records, setRecords] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [date, setDate] = useState(dayjs());
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSummary, setUserSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [downloadingUserReport, setDownloadingUserReport] = useState(false);

  useEffect(() => {
    apiClient.get('/admin/teams').then(res => setTeams(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [date, teamFilter]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const params = { date: date.format('YYYY-MM-DD') };
      if (teamFilter !== 'ALL') params.team = teamFilter;
      const res = await apiClient.get('/admin/attendance', { params });
      setRecords(res.data || []);
    } catch {
      message.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloadingReport(true);
    try {
      const params = { date: date.format('YYYY-MM-DD') };
      if (teamFilter !== 'ALL') params.team = teamFilter;
      const res = await apiClient.get('/admin/attendance/report', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${date.format('YYYY-MM-DD')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const openUserDrawer = async (user) => {
    setSelectedUser(user);
    setDrawerOpen(true);
    setSummaryLoading(true);
    try {
      const res = await apiClient.get(`/admin/attendance/users/${user.id}/summary`);
      setUserSummary(res.data);
    } catch {
      message.error('Failed to load user summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleDownloadUserReport = async () => {
    setDownloadingUserReport(true);
    try {
      const res = await apiClient.get(`/admin/attendance/users/${selectedUser.id}/report`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${selectedUser.email}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download user report');
    } finally {
      setDownloadingUserReport(false);
    }
  };

  const pieData = userSummary
    ? [
        { name: 'Present', value: userSummary.present_count || 0, color: '#52c41a' },
        { name: 'Absent',  value: userSummary.absent_count  || 0, color: '#ff4d4f' },
      ].filter(d => d.value > 0)
    : [];

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Flex align="center" gap={12}>
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#bfbfbf' }} />
          <Flex vertical>
            <Text strong>{`${r.first_name} ${r.last_name}`.trim() || '—'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
          </Flex>
        </Flex>
      ),
    },
    { title: 'Team', dataIndex: 'team_name', key: 'team_name' },
    {
      title: 'Status',
      dataIndex: 'attendance_status',
      key: 'status',
      render: (s) => STATUS_TAG[s] ?? <Tag>{s}</Tag>,
      filters: [
        { text: 'Present', value: 'present' },
        { text: 'Absent', value: 'absent' },
      ],
      onFilter: (value, record) => record.attendance_status === value,
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, r) => (
        <Button size="small" icon={<UserOutlined />} onClick={() => openUserDrawer(r)}>
          View Report
        </Button>
      ),
    },
  ];

  const teamOptions = [
    { value: 'ALL', label: 'All Teams' },
    ...teams.map(t => ({ value: t.id, label: t.name })),
  ];

  return (
    <Flex vertical gap={token.marginLG}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={token.marginSM}>
        <Title level={4} style={{ margin: 0 }}>Attendance</Title>
        <Flex gap={token.marginSM} align="center" wrap="wrap">
          <DatePicker
            value={date}
            onChange={setDate}
            allowClear={false}
            disabledDate={d => d.isAfter(dayjs())}
            suffixIcon={<CalendarOutlined />}
          />
          <Select
            value={teamFilter}
            onChange={setTeamFilter}
            options={teamOptions}
            style={{ minWidth: 160 }}
          />
          <Button
            icon={<DownloadOutlined />}
            loading={downloadingReport}
            onClick={handleDownloadReport}
          >
            Generate Report
          </Button>
        </Flex>
      </Flex>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={records}
        loading={loading}
        pagination={{ pageSize: 15 }}
        size="middle"
      />

      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setUserSummary(null); setSelectedUser(null); }}
        title={selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}` : 'User Report'}
        width="60vw"
        extra={
          <Button
            icon={<DownloadOutlined />}
            loading={downloadingUserReport}
            onClick={handleDownloadUserReport}
            size="small"
          >
            Download Report
          </Button>
        }
      >
        {summaryLoading && <Text type="secondary">Loading…</Text>}

        {userSummary && !summaryLoading && (
          <Flex vertical gap={token.marginLG}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="Days Present" value={userSummary.present_count} valueStyle={{ color: token.colorSuccess }} />
              </Col>
              <Col span={12}>
                <Statistic title="Days Absent" value={userSummary.absent_count} valueStyle={{ color: token.colorError }} />
              </Col>
            </Row>

            <Divider style={{ margin: 0 }} />

            {pieData.length > 0 && (
              <>
                <Text strong>Attendance Breakdown</Text>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}

            <Divider style={{ margin: 0 }} />

            <Text strong>Recent History</Text>
            <Flex vertical gap={4}>
              {(userSummary.history || []).slice(0, 20).map((h) => (
                <Flex key={h.date} justify="space-between" align="center">
                  <Text style={{ fontSize: 13 }}>{h.date}</Text>
                  {STATUS_TAG[h.present ? 'present' : 'absent']}
                </Flex>
              ))}
              {!userSummary.history?.length && <Text type="secondary">No history found.</Text>}
            </Flex>
          </Flex>
        )}
      </Drawer>
    </Flex>
  );
}
