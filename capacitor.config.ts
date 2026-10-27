import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.netflow.browser',
  appName: 'NETFLOW Browser',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
