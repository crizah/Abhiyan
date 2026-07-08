import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../../../components/Logo';

export default function Nav() {
  return (
    <header className="landing-nav">
      <Link to="/" className="landing-nav-mark" aria-label="Home">
        <Logo size={34} />
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
