import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import apiClient from '../config/axios';

// Registers this device for native Android push notifications and keeps the
// in-app bell in sync with pushes that arrive while the app is foregrounded
// (foreground pushes never show in the system tray on their own).
//
// No-op entirely on web: @capacitor/push-notifications' web implementation
// needs its own service-worker + VAPID setup we're not using, so browser
// users keep the existing poll-based /notifications flow untouched.
export function usePushNotifications() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let cancelled = false;
    const handles = [];
    const track = (promise) => {
      promise.then(h => { if (cancelled) h.remove(); else handles.push(h); });
    };

    track(PushNotifications.addListener('registration', async (token) => {
      try {
        await apiClient.post('/devices/register', { fcm_token: token.value });
      } catch (e) {
        console.error('Failed to register device for push', e);
      }
    }));

    track(PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration failed', err);
    }));

    // Foreground receive: the OS never surfaces a tray notification for
    // this, so nudge the same refetch signal the task-update flow uses.
    track(PushNotifications.addListener('pushNotificationReceived', () => {
      window.dispatchEvent(new Event('refresh-notifications'));
    }));

    // Tapped from the tray (app was backgrounded/killed) — no per-notification
    // deep link exists yet, so just make sure the bell is fresh on open.
    track(PushNotifications.addListener('pushNotificationActionPerformed', () => {
      window.dispatchEvent(new Event('refresh-notifications'));
    }));

    // FCM_SERVICE_ACCOUNT_JSON pushes tag messages with channel_id "default" at
    // PRIORITY_HIGH (see push.go), but that only produces a heads-up popup if a
    // channel with that exact id actually has IMPORTANCE_HIGH — Capacitor's own
    // fallback channel is IMPORTANCE_DEFAULT (shade only, no popup). Must exist
    // before any push arrives, so create it unconditionally, ahead of permission
    // checks/registration.
    PushNotifications.createChannel({
      id: 'default',
      name: 'General',
      description: 'Task and account notifications',
      importance: 4, // IMPORTANCE_HIGH — required for the heads-up popup
      visibility: 1,
      vibration: true,
    }).catch(e => console.error('Failed to create notification channel', e));

    (async () => {
      const current = await PushNotifications.checkPermissions();
      let status = current.receive;
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        const requested = await PushNotifications.requestPermissions();
        status = requested.receive;
      }
      if (status !== 'granted') return;
      await PushNotifications.register();
    })();

    return () => {
      cancelled = true;
      handles.forEach(h => h.remove());
    };
  }, []);
}
