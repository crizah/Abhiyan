import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.pharmaflow.abhiyan',
  appName: 'Abhiyan',
  webDir: 'build',
  // Dev-only: load the live CRA dev server instead of a static build so
  // changes hot-reload in the emulator. Using the host's LAN IP (rather than
  // the emulator-only 10.0.2.2 alias) so it's the same address the backend
  // URL in .env.local uses. Remove this whole `server` block before
  // producing a real release build.
  server: {
    url: 'http://192.168.88.11:3000',
    cleartext: true
  }
};

export default config;
