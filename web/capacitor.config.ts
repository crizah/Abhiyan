import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.pharmaflow.abhiyan',
  appName: 'Abhiyan',
  webDir: 'build',
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
