import React from 'react';
import './ShowcaseFrame.css';

// Lightweight "browser window" chrome around each feature showcase — sells
// the idea that what's inside is the real product, not a marketing graphic.
export default function ShowcaseFrame({ path = 'abhiyan.app', children }) {
  return (
    <div className="showcase-frame">
      <div className="showcase-frame-bar">
        <span className="showcase-frame-dot showcase-frame-dot-red" />
        <span className="showcase-frame-dot showcase-frame-dot-yellow" />
        <span className="showcase-frame-dot showcase-frame-dot-green" />
        <span className="showcase-frame-path">{path}</span>
      </div>
      <div className="showcase-frame-body">{children}</div>
    </div>
  );
}
