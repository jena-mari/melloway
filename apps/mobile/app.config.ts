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
  ios: { supportsTablet: true, bundleIdentifier: 'com.melloway.app' },
  android: { package: 'com.melloway.app' },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-status-bar',
    ...(androidKey || iosKey ? [['react-native-maps', {
      ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
      ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
    }] as [string, Record<string, string>]] : []),
  ],
  experiments: { typedRoutes: true },
  extra: { googleMapsIOS: Boolean(iosKey) },
};
export default config;
