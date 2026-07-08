import React from 'react';
import CircularText from './ui/CircularText';
import './Logo.css';

// CircularText renders crisp at a real font size, then this wrapper scales the
// whole rendered layer down to `size` — avoids the sub-pixel jitter you get from
// rotating tiny text directly. Reused everywhere the old static brand mark SVG was.
export default function Logo({ size = 44, className = '' }) {
  const scale = size / 120;

  return (
    <span className={`abhiyan-logo ${className}`} style={{ width: size, height: size }}>
      <div className="abhiyan-logo-scale" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <CircularText
          text="ABHIYAN*ABHIYAN*"
          onHover="speedUp"
          spinDuration={20}
          className="abhiyan-logo-circular"
        />
      </div>
    </span>
  );
}
