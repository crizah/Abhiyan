import React from 'react';
import { Link } from 'react-router-dom';
import PixelBlast from '../../../components/ui/PixelBlast';

export default function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-bg">
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#B3455C"
          patternScale={2}
          patternDensity={1}
          pixelSizeJitter={0}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          speed={0.5}
          edgeFade={0.15}
          transparent
        />
      </div>

      <div className="landing-hero-content">
        <span className="landing-hero-tag">Internal Workforce Platform</span>
        <h1>Manage Tasks.</h1>
        <p className="landing-hero-sub">Skip manual follow up.</p>
        <div className="landing-hero-actions">
          <Link to="/register-org" className="landing-btn landing-btn-primary">
            Get Started
          </Link>
          <Link to="/features" className="landing-btn landing-btn-ghost">
            Explore Features
          </Link>
        </div>
      </div>
    </section>
  );
}
