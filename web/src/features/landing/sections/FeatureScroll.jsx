import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
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

const N = FEATURES.length;

function FeatureLayer({ feature, index, progress }) {
  const start = index / N;
  const end = (index + 1) / N;
  const w = (1 / N) * 0.22;

  const inLo = index === 0 ? start : start - w;
  const inHi = index === 0 ? start : start + w;
  const outLo = index === N - 1 ? end : end - w;
  const outHi = index === N - 1 ? end : end + w;

  const opacity = useTransform(
    progress,
    [inLo, inHi, outLo, outHi],
    [index === 0 ? 1 : 0, 1, 1, index === N - 1 ? 1 : 0]
  );
  const shift = useTransform(progress, [inLo, inHi, outLo, outHi], [24, 0, 0, -24]);

  const Showcase = SHOWCASES[feature.key];

  return (
    <motion.div className="fscroll-layer" style={{ opacity }}>
      <div className="fscroll-bg" style={{ background: `radial-gradient(ellipse 60% 55% at 80% 50%, ${feature.accent}22 0%, transparent 70%)` }} />
      <div className="fscroll-pair">
        <motion.div className="fscroll-text fscroll-text-left" style={{ y: shift }}>
          <span className="fscroll-kicker" style={{ color: feature.accent, borderColor: `${feature.accent}44` }}>
            {feature.kicker}
          </span>
          <h3>{feature.title}</h3>
          <p>{feature.body}</p>
        </motion.div>

        {Showcase && (
          <div className="fscroll-showcase">
            <Showcase />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function FeatureScroll() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  return (
    <>
      <div className="fscroll-intro">
        <span className="fscroll-heading-tag">What Abhiyan does</span>
        <h2>
          One platform,<em> every workflow</em>
        </h2>
      </div>

      <section id="features" className="fscroll" ref={sectionRef} style={{ height: `${N * 170}vh` }}>
        <div className="fscroll-sticky">
          <div className="fscroll-texture" />

          {FEATURES.map((f, i) => (
            <FeatureLayer key={f.key} feature={f} index={i} progress={scrollYProgress} />
          ))}
        </div>
      </section>
    </>
  );
}
