import React, { useEffect, useState } from 'react';
import { animate } from 'motion/react';
import { PieChart, Pie, Cell } from 'recharts';
import { fulfillmentColor, reviewStatusColor } from '../../../../utils/taskColors';
import ShowcaseFrame from './ShowcaseFrame';
import './Showcases.css';

// Same PRESENT/ABSENT colors the real attendance report drawer uses.
const PRESENT_COLOR = fulfillmentColor('COMPLETED');
const ABSENT_COLOR = reviewStatusColor('REJECTED');
const PRESENT = 18;
const ABSENT = 2;
const PIE_DATA = [
  { name: 'Present', value: PRESENT, color: PRESENT_COLOR },
  { name: 'Absent', value: ABSENT, color: ABSENT_COLOR },
];

function useCountUp(target, cycleKey) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, target, {
      duration: 1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return controls.stop;
  }, [target, cycleKey]);
  return display;
}

export default function AttendanceShowcase() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCycle((c) => c + 1), 4500);
    return () => clearInterval(interval);
  }, []);

  const present = useCountUp(PRESENT, cycle);
  const absent = useCountUp(ABSENT, cycle);

  return (
    <ShowcaseFrame path="abhiyan.app/attendance">
      <div className="sc-task-title">Maya Chen · Attendance</div>
      <div className="sc-stat-grid">
        <div className="sc-stat-tile">
          <span className="sc-stat-label">Days Present</span>
          <div className="sc-stat-value" style={{ color: PRESENT_COLOR }}>{present}</div>
        </div>
        <div className="sc-stat-tile">
          <span className="sc-stat-label">Days Absent</span>
          <div className="sc-stat-value" style={{ color: ABSENT_COLOR }}>{absent}</div>
        </div>
      </div>

      <div className="sc-chart-row">
        <PieChart width={92} height={92}>
          <Pie data={PIE_DATA} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={26} outerRadius={44}>
            {PIE_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
        </PieChart>
        <div className="sc-chart-legend">
          <span className="sc-chart-legend-item">
            <span className="sc-chart-dot" style={{ background: PRESENT_COLOR }} />
            Present
          </span>
          <span className="sc-chart-legend-item">
            <span className="sc-chart-dot" style={{ background: ABSENT_COLOR }} />
            Absent
          </span>
        </div>
      </div>
    </ShowcaseFrame>
  );
}
