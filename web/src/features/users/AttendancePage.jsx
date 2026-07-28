import React, { useState, useEffect } from 'react';
import {
  Table, Select, DatePicker, Button, Tag, Flex, Typography,
  message, theme, Avatar, Card, Tooltip as AntTooltip, Segmented
} from 'antd';
import {
  DownloadOutlined, UserOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../config/axios';
import { SlidingCardModal } from '../../components/SlidingCardModal';
import { fulfillmentColor, reviewStatusColor } from '../../utils/taskColors';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PRESENT_COLOR = fulfillmentColor('COMPLETED');
const ABSENT_COLOR = reviewStatusColor('REJECTED');
const NA_COLOR = '#bfbfbf';

const STATUS_TAG = {
  present: <Tag color={PRESENT_COLOR}>Present</Tag>,
  absent:  <Tag color={ABSENT_COLOR}>Absent</Tag>,
  not_applicable: <Tag color={NA_COLOR}>N/A</Tag>,
};

const DEFAULT_DRAWER_RANGE = [dayjs().subtract(29, 'day'), dayjs()];
const disableFutureDate = (d) => d.isAfter(dayjs(), 'day');


export default function AttendancePage() {
  const { token } = theme.useToken();

  const [records, setRecords] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [date, setDate] = useState(dayjs());
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Batch report generation: day (mirrors the list's selected date) or a
  // custom range, independent of the list view above.
  const [reportMode, setReportMode] = useState('day');
  const [reportRange, setReportRange] = useState(DEFAULT_DRAWER_RANGE);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSummary, setUserSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [downloadingUserReport, setDownloadingUserReport] = useState(false);
  const [drawerRange, setDrawerRange] = useState(DEFAULT_DRAWER_RANGE);

  useEffect(() => {
    apiClient.get('/admin/teams').then(res => setTeams(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [date, teamFilter]);

  useEffect(() => {
    if (drawerOpen && selectedUser) fetchUserSummary(selectedUser, drawerRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerRange]);

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
      const params = {};
      if (teamFilter !== 'ALL') params.team = teamFilter;
      let filenameSuffix;
      if (reportMode === 'range' && reportRange?.[0] && reportRange?.[1]) {
        params.from = reportRange[0].format('YYYY-MM-DD');
        params.to = reportRange[1].format('YYYY-MM-DD');
        filenameSuffix = `${params.from}_to_${params.to}`;
      } else {
        params.date = date.format('YYYY-MM-DD');
        filenameSuffix = params.date;
      }
      const res = await apiClient.get('/admin/attendance/report', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${filenameSuffix}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const fetchUserSummary = async (user, range) => {
    setSummaryLoading(true);
    try {
      const params = {
        from: range[0].format('YYYY-MM-DD'),
        to: range[1].format('YYYY-MM-DD'),
      };
      const res = await apiClient.get(`/admin/attendance/users/${user.id}/summary`, { params });
      setUserSummary(res.data);
    } catch {
      message.error('Failed to load user summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const openUserDrawer = async (user) => {
    setSelectedUser(user);
    setDrawerOpen(true);
    setDrawerRange(DEFAULT_DRAWER_RANGE);
    await fetchUserSummary(user, DEFAULT_DRAWER_RANGE);
  };

  const handleDownloadUserReport = async () => {
    setDownloadingUserReport(true);
    try {
      const params = {
        from: drawerRange[0].format('YYYY-MM-DD'),
        to: drawerRange[1].format('YYYY-MM-DD'),
      };
      const res = await apiClient.get(`/admin/attendance/users/${selectedUser.id}/report`, { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${selectedUser.email}_${params.from}_to_${params.to}.csv`;
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
        { name: 'Present', value: userSummary.present_count || 0, color: PRESENT_COLOR },
        { name: 'Absent',  value: userSummary.absent_count  || 0, color: ABSENT_COLOR },
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
        { text: 'N/A', value: 'not_applicable' },
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
          <Segmented
            value={reportMode}
            onChange={setReportMode}
            options={[{ label: 'Day', value: 'day' }, { label: 'Range', value: 'range' }]}
          />
          {reportMode === 'range' && (
            <RangePicker
              value={reportRange}
              onChange={setReportRange}
              allowClear={false}
              disabledDate={disableFutureDate}
              suffixIcon={<CalendarOutlined />}
            />
          )}
          <AntTooltip title={reportMode === 'range'
            ? 'Generates the attendance report across the selected date range and team filter'
            : 'Generates the attendance report for the selected date and team filter'}
          >
            <Button
              icon={<DownloadOutlined />}
              loading={downloadingReport}
              disabled={reportMode === 'range' && !(reportRange?.[0] && reportRange?.[1])}
              onClick={handleDownloadReport}
              style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
            >
              Generate Report
            </Button>
          </AntTooltip>
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

      <SlidingCardModal
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setUserSummary(null); setSelectedUser(null); }}
        title={selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}` : 'User Report'}
        resetKey={selectedUser?.id}
        defaultWidth={640}
        extra={
          <Flex align="center" gap={8}>
            <RangePicker
              size="small"
              value={drawerRange}
              onChange={(v) => v && setDrawerRange(v)}
              allowClear={false}
              disabledDate={disableFutureDate}
            />
            <AntTooltip title="Download this user's attendance report as a CSV file for the selected range">
              <Button
                icon={<DownloadOutlined />}
                loading={downloadingUserReport}
                onClick={handleDownloadUserReport}
                size="small"
                style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
              >
                Download Report
              </Button>
            </AntTooltip>
          </Flex>
        }
        tabs={[
          {
            key: 'report',
            label: 'Report',
            content: (
              <div>
                {summaryLoading && <Text type="secondary">Loading…</Text>}

                {userSummary && !summaryLoading && (
                  <Flex vertical gap={20}>
                    {!userSummary.attendance_enabled && (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Attendance tracking is not enabled for this organization — counts below reflect any
                        historical records only.
                      </Text>
                    )}

                    <Flex gap={12}>
                      <div style={{
                        flex: 1, padding: '16px 20px',
                        border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 12,
                        backgroundColor: '#fafafa',
                      }}>
                        <Text style={{ fontSize: 12, color: 'rgba(24, 24, 27, 0.55)' }}>Days Present</Text>
                        <div style={{ fontSize: 28, fontWeight: 600, color: PRESENT_COLOR, lineHeight: 1.3 }}>
                          {userSummary.present_count}
                        </div>
                      </div>
                      <div style={{
                        flex: 1, padding: '16px 20px',
                        border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 12,
                        backgroundColor: '#fafafa',
                      }}>
                        <Text style={{ fontSize: 12, color: 'rgba(24, 24, 27, 0.55)' }}>Days Absent</Text>
                        <div style={{ fontSize: 28, fontWeight: 600, color: ABSENT_COLOR, lineHeight: 1.3 }}>
                          {userSummary.absent_count}
                        </div>
                      </div>
                    </Flex>

                    {pieData.length > 0 && (
                      <Card size="small" style={{ backgroundColor: '#fafafa', border: 'none', borderRadius: 10 }}>
                        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Attendance Breakdown</Text>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                              {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </Card>
                    )}

                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Recent History</Text>
                      <Flex vertical gap={6}>
                        {(userSummary.history || []).slice(0, 20).map((h) => (
                          <Flex
                            key={h.date}
                            justify="space-between"
                            align="center"
                            style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: '#fafafa' }}
                          >
                            <Text style={{ fontSize: 13 }}>{dayjs(h.date).format('MMM D, YYYY')}</Text>
                            {STATUS_TAG[h.present ? 'present' : 'absent']}
                          </Flex>
                        ))}
                        {!userSummary.history?.length && <Text type="secondary">No history found.</Text>}
                      </Flex>
                    </div>
                  </Flex>
                )}
              </div>
            ),
          },
        ]}
      />
    </Flex>
  );
}
