import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MailOutlined } from '@ant-design/icons';
import ShowcaseFrame from './ShowcaseFrame';
import './Showcases.css';

const CYCLE_MS = 4400;

function WhatsAppIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.48s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35z" />
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.99.58 3.84 1.58 5.39L2 22l4.74-1.55A9.95 9.95 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.2a8.16 8.16 0 0 1-4.17-1.14l-.3-.18-2.81.92.93-2.74-.19-.29A8.18 8.18 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2z" />
    </svg>
  );
}

function ChannelLine({ icon, label, color, cycleKey, delay }) {
  return (
    <div className="sc-reminder-channel-row">
      <span className="sc-reminder-channel-icon" style={{ color }}>{icon}</span>
      <span className="sc-reminder-channel-label">{label}</span>
      <svg width="18" height="18" viewBox="0 0 20 20" style={{ marginLeft: 'auto' }}>
        <motion.circle
          key={`ring-${cycleKey}`}
          cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="1.6"
          initial={{ pathLength: 0, opacity: 0.4 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        />
        <motion.path
          key={`check-${cycleKey}`}
          d="M6 10.2 L8.6 12.8 L14 7.2"
          fill="none" stroke={color} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.35, delay: delay + 0.45, ease: 'easeOut' }}
        />
      </svg>
    </div>
  );
}

export default function RemindersShowcase() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <ShowcaseFrame path="abhiyan.app/reminders">
      <div className="sc-reminder-row">
        <div className="sc-reminder-body">
          <div className="sc-reminder-text">Follow up on Q3 budget review</div>
          <div className="sc-reminder-due">Tomorrow, 9:00 AM</div>
        </div>
      </div>

      <div className="sc-reminder-channels">
        <ChannelLine icon={<MailOutlined />} label="Email" color="#1E3A8A" cycleKey={cycle} delay={0} />
        <ChannelLine icon={<WhatsAppIcon />} label="WhatsApp" color="#25D366" cycleKey={cycle} delay={0.9} />
      </div>
    </ShowcaseFrame>
  );
}
