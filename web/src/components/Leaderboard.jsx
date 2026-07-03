import React from 'react';
import { Select, Typography, Avatar, Flex, Empty, Space, Spin, theme } from 'antd';
import { TrophyOutlined, UserOutlined, CrownFilled, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import InfoTooltip from './InfoTooltip';

const { Text } = Typography;

const GOLD = 'linear-gradient(135deg, #F7E2A0 0%, #D4A94A 55%, #A9782A 100%)';
const SILVER = 'linear-gradient(135deg, #F1F3F5 0%, #C9CDD3 55%, #9AA0A6 100%)';
const BRONZE = 'linear-gradient(135deg, #E3A879 0%, #B5764A 55%, #8A5732 100%)';

function RankAvatar({ entry, size, ring }) {
  return (
    <Avatar
      size={size}
      icon={<UserOutlined />}
      style={{
        backgroundColor: entry.is_current_user ? '#B3455C' : '#3F3A3B',
        border: ring ? `2px solid ${ring}` : '2px solid rgba(242,232,228,0.15)',
        flexShrink: 0,
      }}
    />
  );
}

function PodiumTile({ entry, place }) {
  const isWinner = place === 1;
  const accent = place === 1 ? GOLD : place === 2 ? SILVER : BRONZE;
  const ringColor = place === 1 ? '#D4A94A' : place === 2 ? '#C9CDD3' : '#B5764A';

  return (
    <div className={`gb-podium-tile gb-place-${place}`}>
      {isWinner && <div className="gb-crown"><CrownFilled /></div>}
      <RankAvatar entry={entry} size={isWinner ? 56 : 40} ring={ringColor} />
      <Text className="gb-podium-name" ellipsis>{entry.full_name}</Text>
      <span className="gb-podium-points" style={{ backgroundImage: accent }}>
        {entry.total_points}
      </span>
    </div>
  );
}

function ListRow({ entry }) {
  return (
    <div className={`gb-list-row ${entry.is_current_user ? 'gb-list-row-active' : ''}`}>
      <Text className="gb-list-rank">{entry.rank}</Text>
      <RankAvatar entry={entry} size={32} />
      <div className="gb-list-info">
        <Text className="gb-list-name" ellipsis>{entry.full_name}</Text>
        <div className="gb-list-stats">
          <span><ClockCircleOutlined /> {entry.on_time_count}</span>
          <span><CheckCircleOutlined /> {entry.completed_count}</span>
        </div>
      </div>
      <Text className="gb-list-points">{entry.total_points}</Text>
    </div>
  );
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

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="gb-leaderboard">
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} className="gb-header">
        <Flex align="center" gap={8}>
          <TrophyOutlined className="gb-trophy" />
          <Text className="gb-title">Leaderboard</Text>
        </Flex>

        {teamOptions.length > 0 && (
          <Select
            value={teamFilter}
            className="gb-select"
            popupClassName="gb-select-popup"
            style={{ width: 160 }}
            onChange={onTeamFilterChange}
            options={[{ value: 'ALL', label: 'All Teams' }, ...teamOptions]}
          />
        )}
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
          <Flex align="center" gap={8} className="gb-visibility" wrap="wrap">
            <Space style={{ cursor: 'default' }}>
              <InfoTooltip
                title="Employees in selected teams will be able to see the leaderboard"
                color="rgba(242, 232, 228, 0.55)"
              />
              <Text className="gb-visibility-label">Visible to:</Text>
            </Space>
            <Select
              mode="multiple"
              className="gb-select"
              popupClassName="gb-select-popup"
              style={{ minWidth: 200, flex: 1 }}
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

      {loading ? (
        <Flex justify="center" style={{ padding: '40px 0' }}>
          <Spin />
        </Flex>
      ) : entries.length === 0 ? (
        <div className="gb-empty">
          <Empty description={<span style={{ color: 'rgba(242,232,228,0.55)' }}>No performance data yet</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <>
          <div className="gb-podium">
            {podium[0] && <PodiumTile entry={podium[0]} place={1} />}
            {(podium[1] || podium[2]) && (
              <div className="gb-podium-secondary">
                {podium[1] && <PodiumTile entry={podium[1]} place={2} />}
                {podium[2] && <PodiumTile entry={podium[2]} place={3} />}
              </div>
            )}
          </div>

          {rest.length > 0 && (
            <div className="gb-list">
              {rest.map(entry => <ListRow key={entry.user_id} entry={entry} />)}
            </div>
          )}
        </>
      )}

      <style>{`
        .gb-leaderboard {
          background: linear-gradient(180deg, #1C1516 0%, #131011 100%);
          border: 1px solid rgba(242, 232, 228, 0.08);
          border-radius: ${token.borderRadiusLG}px;
          padding: 20px;
          color: #F2E8E4;
        }

        .gb-header { margin-bottom: 16px; }

        .gb-trophy { font-size: 18px; color: #D4A94A; }

        .gb-title { color: #F2E8E4; font-weight: 600; font-size: 15px; }

        .gb-select .ant-select-selector {
          background: rgba(242, 232, 228, 0.06) !important;
          border-color: rgba(242, 232, 228, 0.14) !important;
          color: #F2E8E4 !important;
        }
        .gb-select .ant-select-selection-item,
        .gb-select .ant-select-selection-placeholder {
          color: #F2E8E4 !important;
        }
        .gb-select .ant-select-arrow { color: rgba(242, 232, 228, 0.55); }

        .gb-visibility { margin-bottom: 16px; }
        .gb-visibility-label { color: rgba(242, 232, 228, 0.7); font-size: 13px; }

        .gb-empty { padding: 24px 0; }

        /* ---------- Podium ---------- */
        .gb-podium {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .gb-podium-tile {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 18px 12px 14px;
          border-radius: ${token.borderRadiusLG}px;
          background: rgba(242, 232, 228, 0.04);
          border: 1px solid rgba(242, 232, 228, 0.08);
          overflow: hidden;
        }

        .gb-place-1 {
          padding-top: 30px;
          border: 1px solid rgba(212, 169, 74, 0.4);
          animation: gb-winner-glow 2.6s ease-in-out infinite;
        }

        .gb-place-1::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 40%, rgba(247, 226, 160, 0.14) 50%, transparent 60%);
          background-size: 220% 100%;
          animation: gb-shimmer 3.2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes gb-winner-glow {
          0%, 100% { box-shadow: 0 0 18px 2px rgba(212, 169, 74, 0.22); }
          50% { box-shadow: 0 0 32px 8px rgba(212, 169, 74, 0.4); }
        }

        @keyframes gb-shimmer {
          0% { background-position: -220% 0; }
          100% { background-position: 220% 0; }
        }

        .gb-crown {
          position: absolute;
          top: 8px;
          font-size: 20px;
          background: ${GOLD};
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: gb-crown-float 2.6s ease-in-out infinite;
        }

        @keyframes gb-crown-float {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50% { transform: translateY(-4px) rotate(4deg); }
        }

        .gb-podium-secondary {
          display: flex;
          gap: 12px;
        }
        .gb-podium-secondary .gb-podium-tile { flex: 1; padding-top: 16px; }

        .gb-podium-name {
          color: #F2E8E4;
          font-weight: 600;
          font-size: 13px;
          max-width: 120px;
          text-align: center;
        }

        .gb-podium-points {
          font-weight: 700;
          font-size: 18px;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }

        .gb-place-1 .gb-podium-points { font-size: 24px; }

        /* ---------- List ---------- */
        .gb-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .gb-list-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 10px;
        }

        .gb-list-row-active {
          background: rgba(179, 69, 92, 0.16);
        }

        .gb-list-rank {
          width: 18px;
          color: rgba(242, 232, 228, 0.45);
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }

        .gb-list-info { flex: 1; min-width: 0; }

        .gb-list-name { display: block; color: #F2E8E4; font-size: 13px; font-weight: 500; }

        .gb-list-stats {
          display: flex;
          gap: 10px;
          margin-top: 2px;
          font-size: 11px;
          color: rgba(242, 232, 228, 0.45);
        }
        .gb-list-stats span { display: inline-flex; align-items: center; gap: 4px; }

        .gb-list-points {
          color: #F2E8E4;
          font-weight: 700;
          font-size: 14px;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
