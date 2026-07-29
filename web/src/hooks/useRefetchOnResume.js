import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';

// Per-key last-fetch timestamps, shared across every call site so a resume
// only refetches data that's actually old enough to be worth the request.
const lastFetchedAt = new Map();

// Call this after any fetch for `key` that happens outside the resume event
// itself (initial mount load, manual pull-to-refresh, etc.) so the throttle
// window is measured from the real last fetch, not just resume-triggered ones.
export function markFetched(key) {
  lastFetchedAt.set(key, Date.now());
}

// Refetches `callback` when the app is brought back to the foreground —
// works both in a plain browser tab (via @capacitor/app's web shim over
// document.visibilitychange) and inside the native Capacitor wrapper (via
// the real OS resume event). Never polls; only fires on a real foreground
// transition, and at most once per `minIntervalMs` per `key`.
export function useRefetchOnResume(key, callback, { minIntervalMs = 60000, enabled = true } = {}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;

    const tryRefetch = () => {
      const now = Date.now();
      const last = lastFetchedAt.get(key) ?? 0;
      if (now - last < minIntervalMs) return;
      lastFetchedAt.set(key, now);
      callbackRef.current();
    };

    let handle;
    let cancelled = false;
    App.addListener('resume', tryRefetch).then(h => {
      if (cancelled) h.remove();
      else handle = h;
    });

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [key, minIntervalMs, enabled]);
}
