import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import PixelBlast from '../../../components/ui/PixelBlast';
import RotatingText from '../../../components/ui/RotatingText';

const ROTATING_WORDS = ['Tasks', 'Teams', 'Time'];

const SUB_LINES = [
  { before: 'Skip ', word: 'manual', after: ' follow up.' },
  { before: 'Track work to ', word: 'close', after: '.' },
  { before: 'Never miss a ', word: 'deadline', after: '.' },
  { before: 'Verify attendance by ', word: 'face', after: '.' },
  { before: 'Turn progress into ', word: 'points', after: '.' },
];

// Types a line out, holds, deletes it, and moves to the next — the keyword in
// each line stays in the same italic-serif accent treatment used site-wide.
function TypewriterSub({ lines }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [phase, setPhase] = useState('typing');

  const current = lines[lineIndex];
  const fullText = current.before + current.word + current.after;

  useEffect(() => {
    let timeout;
    if (phase === 'typing') {
      if (typedCount < fullText.length) {
        timeout = setTimeout(() => setTypedCount((c) => c + 1), 38);
      } else {
        timeout = setTimeout(() => setPhase('deleting'), 1500);
      }
    } else {
      if (typedCount > 0) {
        timeout = setTimeout(() => setTypedCount((c) => c - 1), 16);
      } else {
        timeout = setTimeout(() => {
          setLineIndex((i) => (i + 1) % lines.length);
          setPhase('typing');
        }, 300);
      }
    }
    return () => clearTimeout(timeout);
  }, [phase, typedCount, fullText, lines.length]);

  const beforeLen = current.before.length;
  const wordLen = current.word.length;
  const beforeShown = current.before.slice(0, Math.min(typedCount, beforeLen));
  const wordShown = current.word.slice(0, Math.max(0, Math.min(typedCount - beforeLen, wordLen)));
  const afterShown = current.after.slice(0, Math.max(0, typedCount - beforeLen - wordLen));

  return (
    <p className="landing-hero-sub">
      {beforeShown}
      <em>{wordShown}</em>
      {afterShown}
      <span className="landing-hero-cursor" />
    </p>
  );
}

export default function Hero() {
  const heroRef = useRef(null);
  // Tracks how far the user has scrolled past the hero (0 at the top, 1 once
  // the hero has fully scrolled out from under the viewport).
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const bgOpacity = useTransform(scrollYProgress, [0, 0.55], [0.4, 0]);
  const scrollShiftY = useTransform(scrollYProgress, [0, 0.4], [0, -40]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);

  return (
    <section className="landing-hero" ref={heroRef}>
      <motion.div className="landing-hero-bg" style={{ opacity: bgOpacity }}>
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#B3455C"
          patternScale={2}
          patternDensity={0.25}
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
      </motion.div>

      <motion.div
        className="landing-hero-content"
        style={{ opacity: contentOpacity, y: scrollShiftY }}
      >
        <span className="landing-hero-tag">Internal Workforce Platform</span>
        <h1>
          Manage{' '}
          <RotatingText
            texts={ROTATING_WORDS}
            mainClassName="landing-hero-rotating"
            elementLevelClassName="landing-hero-rotating-char"
            staggerFrom="last"
            initial={{ y: '60%', rotateX: 70, opacity: 0 }}
            animate={{ y: '0%', rotateX: 0, opacity: 1 }}
            exit={{ y: '-60%', rotateX: -70, opacity: 0 }}
            staggerDuration={0.025}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            rotationInterval={2200}
            splitBy="characters"
            auto
            loop
          />
          .
        </h1>
        <TypewriterSub lines={SUB_LINES} />
        <div className="landing-hero-actions">
          <Link to="/register-org" className="landing-btn landing-btn-primary">
            Get Started
          </Link>
          <a href="#features" className="landing-btn landing-btn-ghost">
            Explore Features
          </a>
        </div>
      </motion.div>
    </section>
  );
}
