// Single source of truth for task-related status/role → color mapping, shared by the
// employee + admin task tables and the task overview panel (TaskDrawerShared.jsx).
const FALLBACK = '#71717A';

export const FULFILLMENT_COLORS = {
  PENDING: '#1E3A8A',
  COMPLETED: '#166534',
};

export const TASK_STATUS_COLORS = {
  OPEN: '#1E3A8A',
  CLOSED: '#71717A',
};

export const REVIEW_STATUS_COLORS = {
  UNSUBMITTED: '#71717A',
  PENDING: '#6B21A8',
  APPROVED: '#166534',
  REJECTED: '#991B1B',
};

export const PARTICIPANT_ROLE_COLORS = {
  CREATOR: '#1E3A8A',
  ASSIGNEE: '#166534',
  SUBSCRIBER: '#6B21A8',
};

export const fulfillmentColor = (status) => FULFILLMENT_COLORS[status] || FALLBACK;
export const taskStatusColor = (status) => TASK_STATUS_COLORS[status] || FALLBACK;
export const reviewStatusColor = (status) => REVIEW_STATUS_COLORS[status] || FALLBACK;
export const roleColor = (role) => PARTICIPANT_ROLE_COLORS[role] || FALLBACK;
