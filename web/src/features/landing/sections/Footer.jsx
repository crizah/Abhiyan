import React from 'react';
import { Link } from 'react-router-dom';
import { GithubOutlined } from '@ant-design/icons';
import Logo from '../../../components/Logo';

export default function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-mark">
        <Logo size={64} />
      </div>

      <p className="landing-footer-tagline">
        Built for teams that work remotely and still need real on-ground follow up and management.
      </p>

      <div className="landing-footer-actions">
        <Link to="/login" className="landing-btn landing-btn-ghost">
          Sign In
        </Link>
        <Link to="/register-org" className="landing-btn landing-btn-primary">
          Sign Up
        </Link>
      </div>

      <a
        href="https://github.com/crizah/Abhiyan"
        target="_blank"
        rel="noreferrer"
        className="landing-footer-github"
        aria-label="Abhiyan on GitHub"
      >
        <GithubOutlined />
      </a>

      <p className="landing-footer-copy">© {new Date().getFullYear()} Abhiyan. All rights reserved.</p>
    </footer>
  );
}
