import React from 'react';
import { Link } from 'react-router-dom';
import CircularText from '../../../components/ui/CircularText';

export default function Nav() {
  return (
    <header className="landing-nav">
      <Link to="/" className="landing-nav-mark" aria-label="Home">
        <span className="nav-logo-clip">
          <div className="nav-logo-scale">
            <CircularText
              text=" ABHIYAN*ABHIYAN*"
              onHover="speedUp"
              spinDuration={20}
              className="nav-logo-circular"
            />
          </div>
        </span>
        <span>Abhiyan</span>
      </Link>

      <nav className="landing-nav-links">
        <a href="#features" className="landing-nav-link">
          Features
        </a>
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
