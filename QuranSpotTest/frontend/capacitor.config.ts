import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.akmil.app',
  appName: 'Akmil',
  webDir: 'public',
  server: {
    url: 'https://akmil-fl5l.vercel.app',
    cleartext: false,
  },
};

export default config;
