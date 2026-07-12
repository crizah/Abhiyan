import React from 'react';
import { SHOWCASES } from './showcases';

const FEATURES = [
  {
    key: 'org',
    kicker: 'Organization',
    title: 'Invite your team in minutes',
    body: 'Register your org once, then invite employees by email and organize them into teams. Every user carries a system role (Super Admin, Admin, or Employee) plus a team role (Team Admin or Member) in each team they belong to, and can move between roles and teams without ever logging out.',
    accent: '#1E3A8A',
  },
  {
    key: 'tasks',
    kicker: 'Tasks',
    title: 'Assign work, track it to close',
    body: 'Tasks live inside teams, carry due dates and attachments, and move through a clear lifecycle: open, submitted for review, approved or rejected. Updates can include files or voice notes (automatically transcribed), and threaded comments keep the whole team aligned as work moves forward.',
    accent: '#B3455C',
  },
  {
    key: 'reminders',
    kicker: 'Reminders',
    title: 'Nothing slips through',
    body: 'Attach a reminder to any task and it fires on schedule over WhatsApp or email, one-off or recurring on a custom interval. Assignees get nudged automatically as a deadline approaches, so follow-ups happen without anyone having to chase them down.',
    accent: '#6B21A8',
  },
  {
    key: 'attendance',
    kicker: 'Attendance',
    title: 'Attendance, verified by face',
    body: 'Employees check in with a live selfie, and Abhiyan matches it against their registered photo to mark them present automatically, no badges, no manual sign-in sheets. Admins get a per-team attendance report with a daily present or absent breakdown they can export any time.',
    accent: '#166534',
  },
  {
    key: 'scoring',
    kicker: 'Performance',
    title: 'Progress that earns points',
    body: 'Every approved task earns points, with a bonus the earlier it finishes ahead of the deadline. Admins can switch on a live leaderboard per team, track on-time versus late completions, and download a full performance report for any employee.',
    accent: '#9A3A4E',
  },
];

// Plain stacked list, normal document scroll — no pinning, no scroll-scrubbed
// motion. Each row is divided from the next by a top border plus its own
// kicker/heading, which is enough to break the page up on its own.
export default function FeatureScroll() {
  return (
    <section id="features" className="fscroll">
      <div className="fscroll-intro">
        <span className="fscroll-heading-tag">What Abhiyan does</span>
        <h2>
          One platform,<em> every workflow</em>
        </h2>
      </div>

      <div className="fscroll-list">
        {FEATURES.map((feature) => {
          const Showcase = SHOWCASES[feature.key];
          return (
            <div className="fscroll-row" key={feature.key}>
              <div className="fscroll-text fscroll-text-left">
                <span className="fscroll-kicker" style={{ color: feature.accent, borderColor: `${feature.accent}44` }}>
                  {feature.kicker}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>

              {Showcase && (
                <div className="fscroll-showcase">
                  <Showcase />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
