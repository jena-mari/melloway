import type { ExpoConfig } from 'expo/config';

const androidKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
const iosKey = process.env.GOOGLE_MAPS_IOS_KEY;
const config: ExpoConfig = {
  name: 'Melloway',
  slug: 'melloway',
  version: '1.0.0',
  scheme: 'melloway',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true, bundleIdentifier: 'com.melloway.app',
    ...(iosKey ? { config: { googleMapsApiKey: iosKey } } : {}),
  },
  android: {
    package: 'com.melloway.app',
    ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
  },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-font',
  ],
  experiments: { typedRoutes: true },
  extra: { googleMapsIOS: Boolean(iosKey) },
};
export default config;
