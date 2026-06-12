export const ROLE_COLORS = {
  SUPER_ADMIN: 'blue',
  ADMIN: 'green',
  EMPLOYEE: 'gold', // Ant Design's standard dark yellow

  // Team Scoped Roles
  TEAM_ADMIN: 'purple',
  MEMBER: 'cyan',
};

export const STATUS_COLORS = {
  ACTIVE: 'green',
  SUSPENDED: 'red',
  INVITED: 'gold',
};



// Helper function to format roles nicely
export const formatRole = (role) => (role || '').replace('_', ' ');