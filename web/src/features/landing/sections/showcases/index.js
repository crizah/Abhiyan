import OrganizationShowcase from './OrganizationShowcase';
import TaskUpdateShowcase from './TaskUpdateShowcase';
import RemindersShowcase from './RemindersShowcase';
import AttendanceShowcase from './AttendanceShowcase';
import PerformanceShowcase from './PerformanceShowcase';

// Keyed by FEATURES[].key in FeatureScroll.jsx.
export const SHOWCASES = {
  org: OrganizationShowcase,
  tasks: TaskUpdateShowcase,
  reminders: RemindersShowcase,
  attendance: AttendanceShowcase,
  scoring: PerformanceShowcase,
};
