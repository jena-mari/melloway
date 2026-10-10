export interface MobileConfig { mode: 'demo' | 'live'; apiUrl?: string }

export function resolveConfig(mode?: string, apiUrl?: string): MobileConfig {
  if (!mode || mode === 'demo') return { mode: 'demo' };
  if (mode !== 'live') throw new Error('EXPO_PUBLIC_DATA_MODE must be demo or live.');
  if (!apiUrl) throw new Error('Live mode needs EXPO_PUBLIC_API_URL, such as http://192.168.1.10:3001.');
  const url = new URL(apiUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('EXPO_PUBLIC_API_URL must be an absolute HTTP(S) origin without /api, credentials, or query parameters.');
  }
  return { mode: 'live', apiUrl: url.origin };
}
// Literal property access is required for Expo's public environment substitution.
export function mobileConfig(): MobileConfig {
  return resolveConfig(process.env.EXPO_PUBLIC_DATA_MODE, process.env.EXPO_PUBLIC_API_URL);
}
