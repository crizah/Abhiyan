import React from 'react';
import { Link } from 'react-router-dom';

export default function Nav() {
  return (
    <header className="landing-nav">
      <Link to="/" className="landing-nav-mark" aria-label="Home">
        <svg width="30" height="30" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="4" y="4" width="26" height="26" rx="8" transform="rotate(-8 17 17)" fill="#18181B" />
          <rect x="16" y="16" width="22" height="22" rx="7" transform="rotate(14 27 27)" fill="#B3455C" />
        </svg>
        <span>Abhiyan</span>
      </Link>

      <nav className="landing-nav-links">
        <Link to="/features" className="landing-nav-link">
          Features
        </Link>
      </nav>

      <div className="landing-nav-actions">
        <Link to="/login" className="landing-nav-link">
          Sign In
        </Link>
        <Link to="/register-org" className="landing-btn landing-btn-primary landing-btn-sm">
          Sign Up
        </Link>
      </div>
    </header>
  );
}
