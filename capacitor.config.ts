import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.teleiraq.app',
  appName: 'TeleIraq',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
