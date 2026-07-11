import React, { useEffect, useState } from 'react';
import { Avatar, Tag, Button } from 'antd';
import { UserOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons';
import PillTabPanel from '../../../../components/PillTabPanel';
import { ROLE_COLORS, STATUS_COLORS, formatRole } from '../../../../utils/colorMaps';
import ShowcaseFrame from './ShowcaseFrame';
import './Showcases.css';

// Same ROLE_COLORS/STATUS_COLORS the real Users Directory table uses, and the
// same PillTabPanel component TeamsPage.jsx uses for its Team/User tab switch.
// Generic seeded names, nothing tied to a real account.
const USERS = [
  { id: 1, name: 'Alicia Kim', email: 'alicia.kim@example.com', role: 'ADMIN', status: 'ACTIVE' },
  { id: 2, name: 'Diego Ruiz', email: 'diego.ruiz@example.com', role: 'EMPLOYEE', status: 'ACTIVE' },
  { id: 3, name: 'Jordan Blake', email: 'jordan.blake@example.com', role: 'EMPLOYEE', status: 'INVITED' },
];

const TEAMS = [
  { id: 1, name: 'Customer Success', members: 8 },
  { id: 2, name: 'Warehouse Ops', members: 12 },
  { id: 3, name: 'Field Sales', members: 5 },
];

const TAB_KEYS = ['users', 'teams'];
const CYCLE_MS = 3600;

function UserDirectory({ activated }) {
  return (
    <div className="sc-user-list">
      {USERS.map((u) => {
        const status = u.id === 3 && activated ? 'ACTIVE' : u.status;
        return (
          <div className="sc-user-row" key={u.id}>
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#bfbfbf', flexShrink: 0 }} />
            <div className="sc-user-info">
              <span className="sc-user-name">{u.name}</span>
              <span className="sc-user-email">{u.email}</span>
            </div>
            <div className="sc-user-tags">
              <Tag color={ROLE_COLORS[u.role]}>{formatRole(u.role)}</Tag>
              <Tag color={STATUS_COLORS[status]}>{status}</Tag>
            </div>
          </div>
        );
      })}
      <Button type="default" size="small" icon={<SettingOutlined />} style={{ marginTop: 2, fontSize: 12, alignSelf: 'flex-start' }}>
        Manage User
      </Button>
    </div>
  );
}

function TeamDirectory() {
  return (
    <div className="sc-user-list">
      {TEAMS.map((t) => (
        <div className="sc-user-row" key={t.id}>
          <Avatar icon={<TeamOutlined />} style={{ backgroundColor: '#B3455C', flexShrink: 0 }} />
          <div className="sc-user-info">
            <span className="sc-user-name">{t.name}</span>
            <span className="sc-user-email">{t.members} members</span>
          </div>
          <Button type="default" size="small" icon={<SettingOutlined />} style={{ fontSize: 11 }}>
            Manage
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function OrganizationShowcase() {
  const [tab, setTab] = useState('users');
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTab((t) => TAB_KEYS[(TAB_KEYS.indexOf(t) + 1) % TAB_KEYS.length]);
      setActivated((v) => !v);
    }, CYCLE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <ShowcaseFrame path="abhiyan.app/organization">
      <PillTabPanel
        activeKey={tab}
        onChange={setTab}
        tabs={[
          {
            key: 'users',
            label: <><UserOutlined /> User Directory</>,
            content: <UserDirectory activated={activated} />,
          },
          {
            key: 'teams',
            label: <><TeamOutlined /> Team Directory</>,
            content: <TeamDirectory />,
          },
        ]}
      />
    </ShowcaseFrame>
  );
}
