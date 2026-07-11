import React, { useEffect, useState } from 'react';
import { animate } from 'motion/react';
import { Tag } from 'antd';
import ShowcaseFrame from './ShowcaseFrame';
import './Showcases.css';

// Same event-type palette as the real Performance / ScoreBreakdown panel.
const STATS = [
  { label: 'Total Points', target: 248, color: '#B3455C' },
  { label: 'On Time', target: 19, color: '#52c41a' },
  { label: 'Late', target: 3, color: '#fa8c16' },
];

const ACTIVITY = [
  { id: 1, title: 'Client onboarding call notes', tag: 'On Time', color: 'green', points: '+12' },
  { id: 2, title: 'Weekly inventory sync', tag: 'Late', color: 'orange', points: '+3' },
];

function useCountUp(target, cycleKey) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, target, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return controls.stop;
  }, [target, cycleKey]);
  return display;
}

export default function PerformanceShowcase() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCycle((c) => c + 1), 4500);
    return () => clearInterval(interval);
  }, []);

  // STATS has a fixed length, so calling the hook once per entry (unrolled,
  // not inside the .map() below) keeps hook call order stable across renders.
  const values = [
    useCountUp(STATS[0].target, cycle),
    useCountUp(STATS[1].target, cycle),
    useCountUp(STATS[2].target, cycle),
  ];

  return (
    <ShowcaseFrame path="abhiyan.app/reports/performance">
      <div className="sc-task-title">Diego Ruiz · Performance</div>
      <div className="sc-stat-grid">
        {STATS.map((s, i) => (
          <div className="sc-stat-tile" key={s.label}>
            <span className="sc-stat-label">{s.label}</span>
            <div className="sc-stat-value" style={{ color: s.color }}>{values[i]}</div>
          </div>
        ))}
      </div>

      {ACTIVITY.map((a) => (
        <div className="sc-activity-row" key={a.id}>
          <span className="sc-activity-title">{a.title}</span>
          <Tag color={a.color} style={{ flexShrink: 0 }}>{a.tag}</Tag>
          <span className="sc-activity-points" style={{ color: '#52c41a' }}>{a.points}</span>
        </div>
      ))}
    </ShowcaseFrame>
  );
}
