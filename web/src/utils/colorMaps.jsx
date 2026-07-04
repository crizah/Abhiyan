import { taskStatusColor, fulfillmentColor, reviewStatusColor } from './taskColors';

// Reuse the exact same hex values as the task status/role palette (taskColors.js) so
// "navy blue", "dark green", etc. mean one consistent color everywhere in the app.
const NAVY_BLUE = taskStatusColor('OPEN');
const DARK_GREEN = fulfillmentColor('COMPLETED');
const DARK_RED = reviewStatusColor('REJECTED');
const DARK_PURPLE = reviewStatusColor('PENDING');
const DARK_YELLOW = '#A16207';

export const ROLE_COLORS = {
  SUPER_ADMIN: NAVY_BLUE,
  ADMIN: DARK_GREEN,
  EMPLOYEE: DARK_YELLOW,

  // Team Scoped Roles
  TEAM_ADMIN: 'purple',
  MEMBER: 'cyan',
};

export const STATUS_COLORS = {
  ACTIVE: DARK_GREEN,
  SUSPENDED: DARK_RED,
  INVITED: DARK_PURPLE,
};



// Helper function to format roles nicely
export const formatRole = (role) => (role || '').replace('_', ' ');