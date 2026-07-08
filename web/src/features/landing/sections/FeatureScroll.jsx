import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

const FEATURES = [
  {
    key: 'org',
    num: '01',
    kicker: 'Organization',
    title: 'Invite your team in minutes',
    body: 'Register your org once, then invite employees by email. Every user carries a system role — Super Admin, Admin, or Employee — and can switch roles without logging out.',
    accent: '#1E3A8A',
  },
  {
    key: 'tasks',
    num: '02',
    kicker: 'Tasks',
    title: 'Assign work, track it to close',
    body: 'Tasks live inside teams, carry due dates and attachments, and move through a clear lifecycle — open, submitted for review, approved or rejected. Updates and threaded comments keep everyone aligned.',
    accent: '#B3455C',
  },
  {
    key: 'reminders',
    num: '03',
    kicker: 'Reminders',
    title: 'Nothing slips through',
    body: 'Attach a reminder to any task and it fires on schedule over WhatsApp or email — one-off or recurring — so follow-ups happen automatically, not manually.',
    accent: '#6B21A8',
  },
  {
    key: 'attendance',
    num: '04',
    kicker: 'Attendance',
    title: 'Attendance, verified by face',
    body: 'Employees check in with a live selfie. Abhiyan matches it against their registered photo to mark them present — no badges, no manual sign-in sheets.',
    accent: '#166534',
  },
  {
    key: 'scoring',
    num: '05',
    kicker: 'Performance',
    title: 'Progress that earns points',
    body: 'Every approved task earns points, with a bonus for finishing early. Admins can switch on a live leaderboard per team and download performance reports any time.',
    accent: '#9A3A4E',
  },
];

const N = FEATURES.length;
// Node checkpoints sit at each feature segment's midpoint — the same fraction of
// total scroll progress that FeatureLayer uses to decide a feature is "active" —
// so the fill tip visually arrives at a node exactly when that feature comes alive.
const THRESHOLDS = FEATURES.map((_, i) => (i + 0.5) / N);
const MERGE_DIP = 0.022;

// Builds a keyframe list that sits at `rest` everywhere except a narrow dip to
// `dipTo` centered on each threshold — used to make the traveling leader dot
// visually "merge into" a checkpoint the instant it reaches it.
function useMergeDip(progress, rest, dipTo) {
  const input = [0];
  const output = [rest];
  THRESHOLDS.forEach((t) => {
    input.push(t - MERGE_DIP, t, t + MERGE_DIP);
    output.push(rest, dipTo, rest);
  });
  input.push(1);
  output.push(rest);
  return useTransform(progress, input, output);
}

function Doodle({ accent, seed }) {
  const shapes = [
    <>
      <circle cx="200" cy="200" r="140" stroke={accent} strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="4 8" fill="none" />
      <rect x="110" y="110" width="180" height="180" rx="24" stroke={accent} strokeOpacity="0.25" strokeWidth="1.2" fill="none" transform="rotate(12 200 200)" />
      <circle cx="200" cy="200" r="6" fill={accent} fillOpacity="0.5" />
    </>,
    <>
      <rect x="90" y="90" width="220" height="220" rx="40" stroke={accent} strokeOpacity="0.3" strokeWidth="1.2" fill="none" transform="rotate(-8 200 200)" />
      <path d="M100 260 Q200 180 300 260" stroke={accent} strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
      <circle cx="140" cy="140" r="4" fill={accent} fillOpacity="0.5" />
      <circle cx="260" cy="150" r="4" fill={accent} fillOpacity="0.5" />
    </>,
    <>
      <circle cx="200" cy="200" r="110" stroke={accent} strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
      <circle cx="200" cy="200" r="160" stroke={accent} strokeOpacity="0.18" strokeWidth="1.2" fill="none" />
      <path d="M60 200 L340 200 M200 60 L200 340" stroke={accent} strokeOpacity="0.15" strokeWidth="1" strokeDasharray="2 10" />
    </>,
  ];
  return (
    <svg viewBox="0 0 400 400" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {shapes[seed % shapes.length]}
    </svg>
  );
}

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

  const isRight = index % 2 === 1;

  return (
    <motion.div className="fscroll-layer" style={{ opacity }}>
      <div className="fscroll-bg" style={{ background: `radial-gradient(ellipse 60% 55% at ${isRight ? '20%' : '80%'} 50%, ${feature.accent}22 0%, transparent 70%)` }} />
      <div className={`fscroll-numeral ${isRight ? 'fscroll-numeral-left' : 'fscroll-numeral-right'}`} style={{ color: `${feature.accent}1c` }}>
        {feature.num}
      </div>
      <div className={`fscroll-doodle ${isRight ? 'fscroll-doodle-left' : 'fscroll-doodle-right'}`}>
        <Doodle accent={feature.accent} seed={index} />
      </div>

      <motion.div
        className={`fscroll-text ${isRight ? 'fscroll-text-right' : 'fscroll-text-left'}`}
        style={{ y: shift }}
      >
        <span className="fscroll-kicker" style={{ color: feature.accent, borderColor: `${feature.accent}44` }}>
          {feature.kicker}
        </span>
        <h3>{feature.title}</h3>
        <p>{feature.body}</p>
      </motion.div>
    </motion.div>
  );
}

function TimelineNode({ index, progress }) {
  const threshold = THRESHOLDS[index];
  const scale = useTransform(
    progress,
    [threshold - MERGE_DIP, threshold, threshold + MERGE_DIP],
    [1, 1.4, 1]
  );
  const glow = useTransform(
    progress,
    [threshold - MERGE_DIP, threshold, threshold + MERGE_DIP],
    [
      '0 0 6px rgba(179, 69, 92, 0.35)',
      '0 0 22px rgba(179, 69, 92, 0.85)',
      '0 0 6px rgba(179, 69, 92, 0.35)',
    ]
  );

  return (
    <motion.div
      className="fscroll-node-dot"
      style={{ top: `${threshold * 100}%`, left: '50%', x: '-50%', y: '-50%', scale, boxShadow: glow }}
    />
  );
}

// Travels down the line at the exact tip of the fill, and briefly shrinks/fades
// right as it passes each checkpoint so it reads as "merging into" that node.
function TimelineLeader({ progress }) {
  const top = useTransform(progress, (v) => `${v * 100}%`);
  const opacity = useMergeDip(progress, 1, 0);
  const scale = useMergeDip(progress, 1, 0.2);

  return (
    <motion.div
      className="fscroll-leader"
      style={{ top, left: '50%', x: '-50%', y: '-50%', opacity, scale }}
    />
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

      <section id="features" className="fscroll" ref={sectionRef} style={{ height: `${N * 100}vh` }}>
        <div className="fscroll-sticky">
          <div className="fscroll-texture" />

          {FEATURES.map((f, i) => (
            <FeatureLayer key={f.key} feature={f} index={i} progress={scrollYProgress} />
          ))}

          <div className="fscroll-timeline">
            <div className="fscroll-timeline-track">
              <motion.div className="fscroll-timeline-fill" style={{ scaleY: scrollYProgress }} />
            </div>
            {FEATURES.map((f, i) => (
              <TimelineNode key={f.key} index={i} progress={scrollYProgress} />
            ))}
            <TimelineLeader progress={scrollYProgress} />
          </div>
        </div>
      </section>
    </>
  );
}
