import React, { useState } from 'react';
import { motion } from 'motion/react';

// The pill-tab-bar + always-mounted sliding track pattern used across the app's card-style
// panels (task details modal, manage-user/team modals) — extracted here so inline page
// sections (like the Teams page) get the exact same look and motion, not just a similar one.
// `tabs` is `[{ key, label, content }]`. Uncontrolled by default (pass activeKey/onChange to
// control it externally, e.g. to sync with the URL or a parent's state).
export default function PillTabPanel({ tabs, activeKey: controlledKey, onChange, style, contentStyle }) {
  const [internalKey, setInternalKey] = useState(tabs[0]?.key);
  const activeKey = controlledKey ?? internalKey;
  const setActiveKey = onChange ?? setInternalKey;

  const n = tabs.length;
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === activeKey));

  return (
    <div style={style}>
      {n > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'inline-flex',
              gap: 4,
              padding: 4,
              borderRadius: 999,
              background: 'rgba(179, 69, 92, 0.06)',
              border: '1px solid rgba(24, 24, 27, 0.08)',
            }}
          >
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveKey(tab.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: activeKey === tab.key ? '#B3455C' : 'transparent',
                  color: activeKey === tab.key ? '#FFFFFF' : 'rgba(24, 24, 27, 0.55)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: 'relative', overflow: 'hidden', ...contentStyle }}>
        <motion.div
          animate={{ x: `${activeIndex * -(100 / n)}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          style={{ display: 'flex', width: `${n * 100}%` }}
        >
          {tabs.map(tab => (
            <div key={tab.key} style={{ width: `${100 / n}%`, flexShrink: 0, minWidth: 0 }}>
              {tab.content}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
