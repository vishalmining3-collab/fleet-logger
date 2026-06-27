import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fleet.logger',
  appName: 'Fleet Logger',
  webDir: 'dist',
  backgroundColor: '#080d1a',
  server: {
    androidScheme: 'http',
    cleartext: true
  }
};

export default config;
