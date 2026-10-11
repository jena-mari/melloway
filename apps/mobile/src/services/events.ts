import { areas, type EventMapResponse, type EventSearchResponse, type Preferences } from '@melloway/domain';
import { resolveConfig } from './config.ts';

export function eventApiOrigin(): string {
  return resolveConfig('live', process.env.EXPO_PUBLIC_EVENTS_API_URL || process.env.EXPO_PUBLIC_API_URL).apiUrl!;
}

export function eventPreferenceQuery(prefs: Pick<Preferences, 'date' | 'time' | 'duration' | 'budget' | 'area'>): string {
  const query = new URLSearchParams({ time: prefs.time || '11:00', duration: String(prefs.duration), budget: String(prefs.budget) });
  if (prefs.date) query.set('date', prefs.date);
  const area = areas[prefs.area];
  if (area) {
    query.set('lat', String(area.lat)); query.set('lng', String(area.lng)); query.set('radius', String(area.r));
  }
  return query.toString();
}

/** The filtered backend is JSON-only; its venue coordinates remain available without the legacy HTML map. */
export async function fetchPreferenceEvents(query: string, origin = eventApiOrigin()): Promise<EventSearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${resolveConfig('live', origin).apiUrl}/api/events?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 503 ? 'Ticketmaster is not configured on the event server.' : 'Matching events could not be loaded.');
    const data = await response.json() as EventSearchResponse;
    if (!data || !Array.isArray(data.events) || !Array.isArray(data.unknownPriceEvents) || !Array.isArray(data.points)
      || data.events.length + data.unknownPriceEvents.length > 150 || data.points.length > 150
      || !Number.isInteger(data.missingCoordinates) || data.missingCoordinates < 0
      || typeof data.truncated !== 'boolean' || !data.preferences
      || [...data.events, ...data.unknownPriceEvents].some(event => !event || typeof event.id !== 'string' || typeof event.name !== 'string'
        || !event.startDateTime || !Number.isFinite(Date.parse(event.startDateTime))
        || !['fits', 'start-only'].includes(event.timeWindowFit))
      || data.events.some(event => !Number.isFinite(event.minimumPriceAUD) || event.minimumPriceAUD === null || event.minimumPriceAUD < 0)
      || data.unknownPriceEvents.some(event => event.minimumPriceAUD !== null)
      || data.points.some(point => !point || typeof point.label !== 'string' || !Array.isArray(point.eventIds)
        || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
        || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) throw new Error('Invalid filtered event response.');
    return data;
  } finally { clearTimeout(timer); }
}

export async function fetchEventMap(origin = eventApiOrigin()): Promise<EventMapResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${origin}/api/events`, { signal: controller.signal });
    if (!response.ok) throw new Error('Event venues could not be loaded.');
    const data = await response.json() as EventMapResponse;
    if (!data || !Array.isArray(data.events) || !Array.isArray(data.points)
      || data.events.length > 10 || data.points.length > 10 || typeof data.mapAvailable !== 'boolean'
      || !Number.isInteger(data.missingCoordinates) || data.missingCoordinates < 0
      || data.events.some(event => typeof event.id !== 'string' || typeof event.name !== 'string')
      || data.points.some(point => !/^[A-J]$/.test(point.label) || !Array.isArray(point.eventIds)
        || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
        || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) {
      throw new Error('Invalid event venue response.');
    }
    return data;
  } finally { clearTimeout(timer); }
}
