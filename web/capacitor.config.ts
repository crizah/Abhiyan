import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.pharmaflow.abhiyan',
  appName: 'Abhiyan',
  webDir: 'build',
  plugins: {
    SplashScreen: {
      // Held manually (App.js calls SplashScreen.hide() once mounted) instead
      // of a fixed launchShowDuration, so the branded splash stays up through
      // WebView boot + bundle load with no gap where blank white would show.
      launchAutoHide: false,
      backgroundColor: '#F7F5F2',
      androidScaleType: 'CENTER_INSIDE',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  // Dev-only: load the live CRA dev server instead of a static build so
  // changes hot-reload in the emulator. Using localhost (tunneled to the
  // host via `adb reverse tcp:3000 tcp:3000`) rather than the LAN IP, since
  // only localhost/127.0.0.1/https count as a secure context — camera/mic
  // access is silently unavailable on a plain-http LAN address. Remove this
  // whole `server` block before producing a real release build.
  server: {
    url: 'http://localhost:3000',
    cleartext: true
  }
};

export default config;
