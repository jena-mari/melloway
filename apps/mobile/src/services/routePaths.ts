import type { Preferences, Venue } from '@melloway/domain';
import { mobileConfig } from './config';

export async function routePaths(stops: Venue[], prefs: Preferences, signal: AbortSignal) {
  const config = mobileConfig();
  if (config.mode !== 'live' || prefs.transport === 'Not selected' || stops.some(s => s.source === 'demo') || stops.length < 2) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
  const response = await fetch(`${config.apiUrl}/api/itinerary-routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: controller.signal, body: JSON.stringify({ stops: stops.map(stop => ({ ...stop,
      ...('arrival' in stop && Number.isFinite(stop.arrival) ? { departureMinutes: Number(stop.arrival) + stop.mins } : {}) })),
      transport: prefs.transport, date: prefs.date, time: prefs.time }) });
  if (!response.ok) throw new Error('Route lines unavailable.');
  const data = await response.json();
  if (data?.transport !== prefs.transport || !Array.isArray(data.paths) || data.paths.length > stops.length - 1) throw new Error('Invalid route.');
  const seen = new Set<number>();
  const paths = data.paths.map((leg: { fromIndex: number; toIndex: number; path: { lat: number; lng: number }[] }) => {
    if (!Number.isInteger(leg.fromIndex) || leg.fromIndex < 0 || leg.toIndex !== leg.fromIndex + 1 || leg.toIndex >= stops.length || seen.has(leg.fromIndex)
      || !Array.isArray(leg.path) || leg.path.length < 2 || leg.path.length > 10000 || leg.path.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) throw new Error('Invalid route.');
    seen.add(leg.fromIndex);
    return leg.path.map(p => ({ latitude: p.lat, longitude: p.lng }));
  }) as { latitude: number; longitude: number }[][];
  return { paths, partial: paths.length < stops.length - 1 };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
