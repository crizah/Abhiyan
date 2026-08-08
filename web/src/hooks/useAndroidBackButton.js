import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';

// Wires the Android hardware back button to React Router history instead of
// Capacitor's default (exit the app on every press). `canGoBack` reflects
// whether the webview's history stack has a previous entry; when it doesn't
// (we're at a route the user landed on directly, e.g. after login), fall
// back to actually exiting. No-op on web/iOS: the 'backButton' event only
// fires on Android.
export function useAndroidBackButton() {
  const navigate = useNavigate();

  useEffect(() => {
    let handle;
    let cancelled = false;

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        navigate(-1);
      } else {
        CapacitorApp.exitApp();
      }
    }).then(h => {
      if (cancelled) h.remove();
      else handle = h;
    });

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [navigate]);
}
