import React, { useState, useEffect } from 'react';
import {
  Table, DatePicker, Button, Tag, Flex, Typography,
  message, theme, Card,
} from 'antd';
import { PieChartOutlined, CalendarOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../config/axios';
import { SlidingCardModal } from '../../components/SlidingCardModal';
import { fulfillmentColor, reviewStatusColor } from '../../utils/taskColors';

const { Title, Text } = Typography;

const PRESENT_COLOR = fulfillmentColor('COMPLETED');
const ABSENT_COLOR = reviewStatusColor('REJECTED');

const STATUS_TAG = {
  present: <Tag color={PRESENT_COLOR}>Present</Tag>,
  absent: <Tag color={ABSENT_COLOR}>Absent</Tag>,
};

// Full Day reuses the same green as Present; Half Day reuses the same purple
// used for "pending" elsewhere in the app (reviewStatusColor('PENDING')).
const FULL_DAY_COLOR = PRESENT_COLOR;
const HALF_DAY_COLOR = reviewStatusColor('PENDING');

const FULFILLMENT_TAG = {
  FULL_DAY: <Tag color={FULL_DAY_COLOR}>Full Day</Tag>,
  HALF_DAY: <Tag color={HALF_DAY_COLOR}>Half Day</Tag>,
};

const TODAY = dayjs().format('YYYY-MM-DD');
const DEFAULT_RANGE_DAYS = 90;
const disableFutureDate = (d) => d.isAfter(dayjs(), 'day');

export default function MyAttendancePage() {
  const { token } = theme.useToken();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportRange, setReportRange] = useState([dayjs().subtract(DEFAULT_RANGE_DAYS - 1, 'day'), dayjs()]);
  const [reportSummary, setReportSummary] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter]);

  useEffect(() => {
    if (reportOpen) fetchReportSummary(reportRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportOpen, reportRange]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = dateFilter
        ? { from: dateFilter.format('YYYY-MM-DD'), to: dateFilter.format('YYYY-MM-DD') }
        : { from: dayjs().subtract(DEFAULT_RANGE_DAYS - 1, 'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') };
      const res = await apiClient.get('/attendance/me/summary', { params });
      setHistory(res.data?.history || []);
    } catch {
      message.error('Failed to load your attendance');
    } finally {
      setLoading(false);
    }
  };

  const fetchReportSummary = async (range) => {
    setReportLoading(true);
    try {
      const params = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') };
      const res = await apiClient.get('/attendance/me/summary', { params });
      setReportSummary(res.data);
    } catch {
      message.error('Failed to load your report');
    } finally {
      setReportLoading(false);
    }
  };

  const pieData = reportSummary
    ? [
        { name: 'Present', value: reportSummary.present_count || 0, color: PRESENT_COLOR },
        { name: 'Absent', value: reportSummary.absent_count || 0, color: ABSENT_COLOR },
      ].filter(d => d.value > 0)
    : [];

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (d) => (
        <Flex align="center" gap={8}>
          <Text strong={d === TODAY}>{dayjs(d).format('MMM D, YYYY')}</Text>
          {d === TODAY && <Tag color="#B3455C">Today</Tag>}
        </Flex>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'present',
      key: 'status',
      render: (present) => STATUS_TAG[present ? 'present' : 'absent'],
    },
    {
      title: 'Fulfillment',
      dataIndex: 'fulfillment',
      key: 'fulfillment',
      render: (f) => FULFILLMENT_TAG[f] ?? <Text type="secondary">—</Text>,
    },
  ];

  return (
    <Flex vertical gap={token.marginLG}>
      <Flex justify="space-between" align={isMobile ? 'stretch' : 'center'} vertical={isMobile} wrap="wrap" gap={token.marginSM}>
        <Title level={4} style={{ margin: 0 }}>Attendance</Title>
        <Flex gap={token.marginSM} align={isMobile ? 'stretch' : 'center'} vertical={isMobile} wrap="wrap">
          <DatePicker
            value={dateFilter}
            onChange={setDateFilter}
            placeholder="Search a date"
            disabledDate={disableFutureDate}
            suffixIcon={dateFilter ? undefined : <CalendarOutlined />}
            allowClear={{ clearIcon: <CloseCircleOutlined /> }}
            size={isMobile ? 'small' : 'middle'}
            style={isMobile ? { width: '100%' } : undefined}
          />
          <Button
            icon={<PieChartOutlined />}
            onClick={() => setReportOpen(true)}
            block={isMobile}
            size={isMobile ? 'small' : 'middle'}
            style={{ background: '#B3455C', border: 'none', color: '#FFFFFF' }}
          >
            View Report
          </Button>
        </Flex>
      </Flex>

      <Table
        rowKey="date"
        columns={columns}
        dataSource={history}
        loading={loading}
        pagination={{ pageSize: 15 }}
        size="middle"
        rowClassName={(r) => (r.date === TODAY ? 'attendance-today-row' : '')}
        scroll={isMobile ? { x: 'max-content' } : undefined}
      />

      <style>{`
        .attendance-today-row > td { border-top: 2px solid #B3455C !important; border-bottom: 2px solid #B3455C !important; }
        .attendance-today-row > td:first-child { border-left: 2px solid #B3455C !important; }
        .attendance-today-row > td:last-child { border-right: 2px solid #B3455C !important; }
      `}</style>

      <SlidingCardModal
        open={reportOpen}
        onClose={() => { setReportOpen(false); setReportSummary(null); }}
        title="My Attendance Report"
        defaultWidth={520}
        extra={
          <DatePicker.RangePicker
            size="small"
            value={reportRange}
            onChange={(v) => v && setReportRange(v)}
            allowClear={false}
            disabledDate={disableFutureDate}
            suffixIcon={<CalendarOutlined />}
          />
        }
        tabs={[
          {
            key: 'report',
            label: 'Report',
            content: (
              <div>
                {reportLoading && <Text type="secondary">Loading…</Text>}

                {reportSummary && !reportLoading && (
                  <Flex vertical gap={20}>
                    {!reportSummary.attendance_enabled && (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Attendance tracking is not enabled for your organization — counts below reflect any
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
                          {reportSummary.present_count}
                        </div>
                      </div>
                      <div style={{
                        flex: 1, padding: '16px 20px',
                        border: '1px solid rgba(24, 24, 27, 0.08)', borderRadius: 12,
                        backgroundColor: '#fafafa',
                      }}>
                        <Text style={{ fontSize: 12, color: 'rgba(24, 24, 27, 0.55)' }}>Days Absent</Text>
                        <div style={{ fontSize: 28, fontWeight: 600, color: ABSENT_COLOR, lineHeight: 1.3 }}>
                          {reportSummary.absent_count}
                        </div>
                      </div>
                    </Flex>

                    {pieData.length > 0 ? (
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
                    ) : (
                      <Text type="secondary">No attendance records in this range.</Text>
                    )}
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
