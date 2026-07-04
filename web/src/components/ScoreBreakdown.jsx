import React, { useState, useEffect } from 'react';
import { Typography, Spin, Tag, Table, Flex, Button, Statistic, message, theme, Empty } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
  CloseCircleOutlined, DownloadOutlined, TrophyOutlined,
} from '@ant-design/icons';
import apiClient from '../config/axios';
import dayjs from 'dayjs';

const { Text } = Typography;

const EVENT_CONFIG = {
  ON_TIME_COMPLETION: { color: 'green', label: 'On Time', icon: <CheckCircleOutlined /> },
  LATE_COMPLETION:    { color: 'orange', label: 'Late', icon: <ClockCircleOutlined /> },
  MISSED_DEADLINE:    { color: 'red', label: 'Missed', icon: <WarningOutlined /> },
  REJECTION:          { color: 'volcano', label: 'Rejected', icon: <CloseCircleOutlined /> },
};

export default function ScoreBreakdown({ userId, basePath = '/admin/employees', showDownload = true }) {
  const { token } = theme.useToken();
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const fetchBreakdown = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`${basePath}/${userId}/score-breakdown`);
        setBreakdown(res.data);
      } catch {
        message.error('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };
    fetchBreakdown();
  }, [userId, basePath]);

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const res = await apiClient.get(`${basePath.replace(/\/employees|\/users/, '')}/reports/score-download`, {
        params: { user_id: userId },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `score_report_${userId.slice(0, 8)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <Flex justify="center" style={{ padding: 40 }}><Spin /></Flex>;
  if (!breakdown) return null;

  const statCards = [
    { title: 'Total Points', value: breakdown.total_points, icon: <TrophyOutlined />, color: token.colorPrimary },
    { title: 'On Time', value: breakdown.on_time_count, icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: 'Late', value: breakdown.late_count, icon: <ClockCircleOutlined />, color: '#fa8c16' },
    { title: 'Missed', value: breakdown.missed_count, icon: <WarningOutlined />, color: '#ff4d4f' },
    { title: 'Rejected', value: breakdown.rejection_count, icon: <CloseCircleOutlined />, color: '#ff7a45' },
  ];

  const eventColumns = [
    {
      title: 'Task',
      dataIndex: 'task_title',
      key: 'task_title',
      ellipsis: true,
      render: (title) => <Text strong>{title}</Text>,
    },
    {
      title: 'Team',
      dataIndex: 'team_name',
      key: 'team_name',
      width: 120,
    },
    {
      title: 'Event',
      dataIndex: 'event_type',
      key: 'event_type',
      width: 120,
      render: (type) => {
        const cfg = EVENT_CONFIG[type] || { color: 'default', label: type };
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      },
    },
    {
      title: 'Points',
      dataIndex: 'points_awarded',
      key: 'points_awarded',
      width: 80,
      align: 'center',
      render: (pts) => (
        <Text strong style={{ color: pts > 0 ? '#52c41a' : '#8c8c8c' }}>
          {pts > 0 ? `+${pts}` : pts}
        </Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'event_at',
      key: 'event_at',
      width: 100,
      render: (date) => <Text type="secondary">{dayjs(date).format('MMM D, YY')}</Text>,
    },
  ];

  return (
    <div>
      <Flex wrap="wrap" gap={12} style={{ marginBottom: 20 }}>
        {statCards.map((s) => (
          <div key={s.title} style={{
            flex: '1 1 100px', minWidth: 100, padding: '12px 16px',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            background: token.colorBgContainer,
            textAlign: 'center',
          }}>
            <Statistic
              title={<Text style={{ fontSize: 11, color: token.colorTextSecondary }}>{s.title}</Text>}
              value={s.value}
              prefix={React.cloneElement(s.icon, { style: { color: s.color, fontSize: 14 } })}
              valueStyle={{ fontSize: 22, color: s.color, fontWeight: 600 }}
            />
          </div>
        ))}
      </Flex>

      <Text strong style={{ display: 'block', marginBottom: 12 }}>Activity History</Text>
      <Table
        columns={eventColumns}
        dataSource={breakdown.events}
        rowKey="id"
        pagination={{ pageSize: 10, size: 'small' }}
        size="small"
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty description="No scoring events yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      {showDownload && (
        <Flex justify="flex-end" style={{ marginTop: 16 }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadReport}
            loading={downloading}
          >
            Download Report
          </Button>
        </Flex>
      )}
    </div>
  );
}
