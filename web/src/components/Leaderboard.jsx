import React from 'react';
import { Table, Select, Typography, Avatar, Flex, Tag, Empty, Space, Tooltip, theme } from 'antd';
import { TrophyOutlined, UserOutlined, CrownFilled, InfoCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function RankCell({ rank }) {
  if (rank <= 3) {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: MEDAL_COLORS[rank - 1],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 14, color: rank === 1 ? '#000' : '#fff',
        boxShadow: rank === 1 ? '0 0 8px rgba(255,215,0,0.5)' : 'none',
      }}>
        {rank}
      </div>
    );
  }
  return <Text strong style={{ fontSize: 16, color: '#8c8c8c' }}>{rank}</Text>;
}

export default function Leaderboard({
  entries = [],
  loading = false,
  currentUserId,
  teamOptions = [],
  onTeamFilterChange,
  teamFilter = 'ALL',
  showVisibilityToggle = false,
  teamVisibility = [],
  onToggleVisibility,
}) {
  const { token } = theme.useToken();

  const columns = [
    {
      title: '#',
      key: 'rank',
      width: 60,
      align: 'center',
      render: (_, record) => <RankCell rank={record.rank} />,
    },
    {
      title: 'Employee',
      key: 'user',
      render: (_, record) => (
        <Flex align="center" gap={12}>
          <Avatar
            icon={<UserOutlined />}
            style={{
              backgroundColor: record.is_current_user ? token.colorPrimary : '#bfbfbf',
            }}
          />
          <Flex vertical>
            <Text strong>
              {record.full_name}
              {record.rank === 1 && <CrownFilled style={{ color: '#FFD700', marginLeft: 6, fontSize: 14 }} />}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: 'Points',
      dataIndex: 'total_points',
      key: 'total_points',
      width: 100,
      align: 'center',
      render: (points) => (
        <Text strong style={{ fontSize: 18, color: token.colorPrimary }}>
          {points}
        </Text>
      ),
    },
    {
      title: 'On-Time',
      dataIndex: 'on_time_count',
      key: 'on_time_count',
      width: 90,
      align: 'center',
      render: (count) => <Tag color="green">{count}</Tag>,
    },
    {
      title: 'Completed',
      dataIndex: 'completed_count',
      key: 'completed_count',
      width: 100,
      align: 'center',
      render: (count) => <Tag color="blue">{count}</Tag>,
    },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 20 }}>
        <Flex align="center" gap={8}>
          <TrophyOutlined style={{ fontSize: 20, color: '#FFD700' }} />
          <Title level={5} style={{ margin: 0 }}>Leaderboard</Title>
        </Flex>

        <Space wrap>
          {teamOptions.length > 0 && (
            <Select
              value={teamFilter}
              style={{ width: 200 }}
              onChange={onTeamFilterChange}
              options={[{ value: 'ALL', label: 'All Teams' }, ...teamOptions]}
            />
          )}
        </Space>
      </Flex>

      {showVisibilityToggle && teamVisibility.length > 0 && (() => {
        const visibleIds = teamVisibility.filter(tv => tv.leaderboard_visible).map(tv => tv.team_id);
        const allIds = teamVisibility.map(tv => tv.team_id);
        const allSelected = allIds.length > 0 && allIds.every(id => visibleIds.includes(id));
        const ALL_KEY = '__select_all__';

        const handleChange = (newValues) => {
          if (newValues.includes(ALL_KEY)) {
            teamVisibility.forEach(tv => { if (!tv.leaderboard_visible) onToggleVisibility?.(tv.team_id, true); });
            return;
          }
          const prev = new Set(visibleIds);
          const next = new Set(newValues);
          next.forEach(id => { if (!prev.has(id)) onToggleVisibility?.(id, true); });
          prev.forEach(id => { if (!next.has(id)) onToggleVisibility?.(id, false); });
        };

        return (
          <Flex align="center" gap={8} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            <Tooltip title="Employees in selected teams will be able to see the leaderboard">
              <Space style={{ cursor: 'default' }}>
                <InfoCircleOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
                <Text type="secondary" style={{ fontSize: 13 }}>Employee visibility:</Text>
              </Space>
            </Tooltip>
            <Select
              mode="multiple"
              style={{ minWidth: 260 }}
              placeholder="No teams can see leaderboard"
              value={visibleIds}
              onChange={handleChange}
              maxTagCount="responsive"
              options={[
                { value: ALL_KEY, label: 'Select All', disabled: allSelected },
                ...teamVisibility.map(tv => ({ value: tv.team_id, label: tv.team_name || tv.team_id.slice(0, 8) })),
              ]}
            />
          </Flex>
        );
      })()}

      <Table
        columns={columns}
        dataSource={entries}
        rowKey="user_id"
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: <Empty description="No performance data yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        rowClassName={(record) => record.is_current_user ? 'leaderboard-highlight-row' : ''}
        style={{ borderRadius: token.borderRadiusLG, overflow: 'hidden' }}
      />

      <style>{`
        .leaderboard-highlight-row td {
          background: ${token.colorPrimaryBg} !important;
        }
        .leaderboard-highlight-row:hover td {
          background: ${token.colorPrimaryBgHover} !important;
        }
      `}</style>
    </div>
  );
}
