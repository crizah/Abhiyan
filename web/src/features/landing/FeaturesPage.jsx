import React from 'react';
import { Link } from 'react-router-dom';
import Nav from './sections/Nav';
import './landing.css';

export default function FeaturesPage() {
  return (
    <div className="landing-page">
      <Nav />
      <section className="landing-placeholder">
        <span className="landing-hero-tag">Coming Soon</span>
        <h1>Features</h1>
        <p className="landing-hero-sub">
          The full feature breakdown is on its way. In the meantime, jump straight in.
        </p>
        <div className="landing-hero-actions">
          <Link to="/register-org" className="landing-btn landing-btn-primary">
            Get Started
          </Link>
          <Link to="/" className="landing-btn landing-btn-ghost">
            Back Home
          </Link>
        </div>
      </section>
    </div>
  );
}
