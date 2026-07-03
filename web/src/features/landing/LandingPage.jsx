import React from 'react';
import Nav from './sections/Nav';
import Hero from './sections/Hero';
import './landing.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <Nav />
      <Hero />
    </div>
  );
}
