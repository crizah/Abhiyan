import React from 'react';
import Nav from './sections/Nav';
import Hero from './sections/Hero';
import FeatureScroll from './sections/FeatureScroll';
import './landing.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <Nav />
      <Hero />
      <FeatureScroll />
    </div>
  );
}
