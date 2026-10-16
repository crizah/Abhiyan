import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Flex, Typography, Button, Tag, theme } from 'antd';
import { CalendarOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../config/axios';
import { useAuth } from '../context/AuthContext';

const { Text } = Typography;

const POLL_MS = 60000;

// REVIEW cards go to the admin tasks page, everything else to the employee tasks page.
// showDetails=false means the card shows the server-written message instead of team/creator/deadline.
const KIND_META = {
  ASSIGNED: { title: 'New Task Assigned', color: '#1E3A8A', path: '/employee-tasks', byLabel: 'Assigned by', showDetails: true },
  REVIEW: { title: 'Task Ready for Review', color: '#6B21A8', path: '/tasks', byLabel: 'Created by', showDetails: true },
  APPROVED: { title: 'Task Approved', color: '#166534', path: '/employee-tasks', showDetails: false },
  REJECTED: { title: 'Task Rejected', color: '#991B1B', path: '/employee-tasks', showDetails: false },
  REOPENED: { title: 'Task Reopened', color: '#B45309', path: '/employee-tasks', showDetails: false },
};

/**
 * Pop-up card listing the user's new assigned / to-review tasks.
 * Backed by notifications rows flagged with card_kind; dismissing clears the flag.
 * Mounted in AppLayout next to AttendanceCapture.
 */
export default function TaskAlertCards() {
  const { user } = useAuth();
  const { token } = theme.useToken();
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

  return (
    <Modal
      open={cards.length > 0}
      title={cards.length > 1 ? `Tasks needing your attention (${cards.length})` : 'Task needing your attention'}
      footer={null}
      centered
      width={440}
      onCancel={handleClose}
      maskClosable={false}
    >
      <div
        className="notif-scrollbar"
        style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}
      >
        <Flex vertical gap={token.marginSM}>
          {cards.map(card => {
            const meta = KIND_META[card.kind] || KIND_META.ASSIGNED;
            return (
              <div
                key={card.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: token.borderRadiusLG,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderLeft: `4px solid ${meta.color}`,
                  backgroundColor: 'rgba(30, 58, 138, 0.06)',
                }}
              >
                <Flex vertical gap={4}>
                  <Tag color={meta.color} style={{ margin: 0, alignSelf: 'flex-start', fontSize: 11 }}>{meta.title}</Tag>
                  <Text strong style={{ fontSize: 14, wordBreak: 'break-word' }}>{card.task_title}</Text>
                  {meta.showDetails ? (
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <TeamOutlined /> Team: {card.team_name}
                      </Text>
                      {card.assigned_by && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <UserOutlined /> {meta.byLabel}: {card.assigned_by}
                        </Text>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <CalendarOutlined /> Deadline: {card.due_date ? dayjs(card.due_date).format('MMM D, YYYY h:mm A') : 'No deadline'}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 12 }}>{card.message}</Text>
                  )}
                  <Button type="primary" size="small" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => handleView(card)}>
                    Click here to view task
                  </Button>
                </Flex>
              </div>
            );
          })}
        </Flex>
      </div>
    </Modal>
  );
}
