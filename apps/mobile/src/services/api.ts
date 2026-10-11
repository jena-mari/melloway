import type { DiscoveryProvider, MatrixRequest, MatrixResponse, Preferences, Venue, VenueRequest, VenueResponse } from '@melloway/domain';

async function post<T>(origin: string, path: string, body: VenueRequest | MatrixRequest): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${origin}/api/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) throw new Error('Provider unavailable');
    return await response.json() as T;
  } finally { clearTimeout(timer); }
}
export function createGoogleProvider(origin: string): DiscoveryProvider {
  return {
    async venues(prefs: Preferences) {
      const data = await post<VenueResponse>(origin, 'venues', { prefs });
      if (!Array.isArray(data.venues)) throw new Error('Invalid venue response');
      return data.venues.map(v => ({
        ...v, image: v.image ? new URL(v.image, origin).href : undefined,
      }));
    },
    async matrix(venues: Venue[], prefs: Preferences) {
      const data = await post<MatrixResponse>(origin, 'matrix', { venues, prefs });
      if (!Array.isArray(data.matrix) || data.matrix.length !== venues.length || data.matrix.some(row => !Array.isArray(row) || row.length !== venues.length)) {
        throw new Error('Invalid route matrix');
      }
      return data.matrix.map(row => row.map(edge => ({
        ...edge, minutes: edge.minutes === null ? Infinity : edge.minutes,
      })));
    },
  };
}
