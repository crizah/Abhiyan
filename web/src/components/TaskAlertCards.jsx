import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Typography, Button, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../config/axios';
import { useAuth } from '../context/AuthContext';
import { reviewStatusColor } from '../utils/taskColors';

const { Text } = Typography;

const POLL_MS = 60000;
const ROSE = '#B3455C';

// REVIEW cards go to the admin tasks page, everything else to the employee tasks page.
// showDetails=false means the row shows the server-written message under the title.
const KIND_META = {
  ASSIGNED: { label: 'Assigned', color: ROSE, path: '/employee-tasks', showDetails: true },
  REVIEW: { label: 'To Review', color: reviewStatusColor('PENDING'), path: '/tasks', showDetails: true },
  APPROVED: { label: 'Approved', color: reviewStatusColor('APPROVED'), path: '/employee-tasks', showDetails: false },
  REJECTED: { label: 'Rejected', color: reviewStatusColor('REJECTED'), path: '/employee-tasks', showDetails: false },
  REOPENED: { label: 'Reopened', color: '#71717A', path: '/employee-tasks', showDetails: false },
};

/**
 * Pop-up card listing the user's new assigned / to-review / actioned tasks.
 * Backed by notifications rows flagged with card_kind; dismissing clears the flag.
 * Mounted in AppLayout next to AttendanceCapture.
 */
export default function TaskAlertCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);

  const fetchCards = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications/cards');
      setCards(res.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchCards();
    const intervalId = setInterval(fetchCards, POLL_MS);
    window.addEventListener('refresh-notifications', fetchCards);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('refresh-notifications', fetchCards);
    };
  }, [user, fetchCards]);

  const dismiss = async (ids) => {
    setCards(prev => prev.filter(c => !ids.includes(c.id)));
    await Promise.all(ids.map(id => apiClient.put(`/notifications/cards/${id}/dismiss`).catch(() => {})));
  };

  const handleView = async (card) => {
    await dismiss([card.id]);
    navigate(`${KIND_META[card.kind]?.path || '/employee-tasks'}?open=${card.task_id}`);
  };

  // The cross dismisses everything currently shown.
  const handleClose = () => dismiss(cards.map(c => c.id));

  const columns = [
    {
      title: 'Task',
      key: 'task',
      render: (_, card) => {
        const meta = KIND_META[card.kind] || KIND_META.ASSIGNED;
        return (
          <div>
            <Text strong style={{ wordBreak: 'break-word' }}>{card.task_title}</Text>
            {!meta.showDetails && (
              <div><Text style={{ fontSize: 12, color: '#18181B' }}>{card.message}</Text></div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Type',
      key: 'kind',
      width: 110,
      render: (_, card) => {
        const meta = KIND_META[card.kind] || KIND_META.ASSIGNED;
        return <Tag color={meta.color} style={{ margin: 0 }}>{meta.label}</Tag>;
      },
    },
    {
      title: 'Team',
      dataIndex: 'team_name',
      key: 'team',
      width: 130,
      render: text => <Text>{text}</Text>,
    },
    {
      title: 'Assigned By',
      dataIndex: 'assigned_by',
      key: 'by',
      width: 140,
      render: text => text ? <Text>{text}</Text> : <Text style={{ color: '#18181B' }}>—</Text>,
    },
    {
      title: 'Deadline',
      dataIndex: 'due_date',
      key: 'due',
      width: 160,
      render: date => date ? dayjs(date).format('MMM D, YYYY h:mm A') : <Text type="secondary">No deadline</Text>,
    },
    {
      title: '',
      key: 'action',
      width: 120,
      render: (_, card) => (
        <Button type="primary" size="small" onClick={() => handleView(card)}>View Task</Button>
      ),
    },
  ];

  return (
    <>
      <style>{`
        .task-alert-modal .ant-modal-content {
          border-radius: 24px;
          border: 1px solid rgba(24, 24, 27, 0.08);
          box-shadow: 0 20px 40px -15px rgba(24, 24, 27, 0.18);
          padding: 24px;
        }
        .task-alert-modal .ant-modal-header { margin-bottom: 16px; }
        .task-alert-modal .ant-table-wrapper .ant-table {
          border: 1px solid rgba(24, 24, 27, 0.08);
          border-radius: 14px;
          overflow: hidden;
        }
        .task-alert-modal .ant-table-thead > tr > th {
          background: #F2E8E4;
          color: #18181B;
          font-weight: 600;
          font-size: 12px;
          border-bottom: 1px solid rgba(24, 24, 27, 0.08);
        }
        .task-alert-modal .ant-table-tbody > tr > td {
          border-bottom: 1px solid rgba(24, 24, 27, 0.06);
        }
        .task-alert-modal .ant-table-tbody > tr:last-child > td { border-bottom: none; }
        .task-alert-modal .ant-modal-title,
        .task-alert-modal .ant-table-tbody > tr > td,
        .task-alert-modal .ant-table-tbody > tr > td .ant-typography { color: #18181B; }
        .task-alert-modal .ant-table-tbody > tr > td .ant-typography-secondary { color: rgba(24, 24, 27, 0.45); }
        .task-alert-modal .ant-table-body { scrollbar-color: ${ROSE} transparent; scrollbar-width: thin; }
      `}</style>
      <Modal
        className="task-alert-modal"
        open={cards.length > 0}
        title={cards.length > 1 ? `Tasks needing your attention (${cards.length})` : 'Task needing your attention'}
        footer={null}
        centered
        width={900}
        onCancel={handleClose}
        maskClosable={false}
      >
        <Table
          size="middle"
          rowKey="id"
          columns={columns}
          dataSource={cards}
          pagination={false}
          scroll={{ x: 760, y: '50vh' }}
        />
      </Modal>
    </>
  );
}
