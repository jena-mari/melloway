import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type EventSearchResponse, type EventPreferences } from '@melloway/domain';
import { searchSydneyEvents } from './ticketmaster.ts';
import { readEventPreferences } from './eventPreferences.ts';

/** Select only a browser map key; private provider credentials are never fallbacks. */
export function selectGoogleMapsBrowserKey(env: { GOOGLE_MAPS_JS_KEY?: string; GOOGLE_MAPS_DEMO_KEY?: string } = process.env): string | null {
  return env.GOOGLE_MAPS_JS_KEY?.trim() || env.GOOGLE_MAPS_DEMO_KEY?.trim() || null;
}

export function createEventsHandler(options: { fetcher?: typeof fetch; now?: () => Date } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  type Snapshot = Omit<EventSearchResponse, 'mapAvailable'>;
  const cached = new Map<string, { data: Snapshot; expires: number }>();
  const pending = new Map<string, Promise<Snapshot>>();
  async function snapshot(preferences: EventPreferences): Promise<Snapshot> {
    const key = JSON.stringify(preferences);
    const entry = cached.get(key);
    if (entry && entry.expires > now().getTime()) return entry.data;
    const active = pending.get(key);
    if (active) return active;
    if (pending.size >= 4) throw new Error('Event search capacity reached.');
    const task = (async () => {
      const result = await searchSydneyEvents(preferences, { fetcher });
      const all = [...result.events, ...result.unknownPriceEvents];
      const points = eventMapPoints(all);
      const mapped = new Set(points.flatMap(p => p.eventIds));
      const data = { ...result, preferences, points, missingCoordinates: all.filter(e => !mapped.has(e.id)).length };
      if (cached.size >= 32) cached.delete(cached.keys().next().value!);
      cached.set(key, { data, expires: now().getTime() + 60_000 });
      return data;
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    const json = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };
    let preferences: EventPreferences;
    try {
      preferences = readEventPreferences(new URL(req.url ?? '/api/events', 'http://localhost').searchParams, now());
    } catch (error) {
      return json(400, error instanceof Error ? error.message : 'Invalid event preferences.');
    }
    if (!process.env.TICKETMASTER_API_KEY?.trim()) return json(503, 'Ticketmaster is not configured on the server.');
    try {
      const browserKey = selectGoogleMapsBrowserKey();
      const data = { ...await snapshot(preferences), mapAvailable: Boolean(browserKey) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch {
      // All unexpected errors remain private, including URLs and provider response bodies.
      json(502, 'Ticketmaster events could not be loaded.');
    }
  };
}
