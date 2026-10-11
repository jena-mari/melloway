import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type EventMapResponse } from '@melloway/domain';
import { fetchSydneyEvents } from './ticketmaster.ts';

/** Select only a browser map key; private provider credentials are never fallbacks. */
export function selectGoogleMapsBrowserKey(env: { GOOGLE_MAPS_JS_KEY?: string; GOOGLE_MAPS_DEMO_KEY?: string } = process.env): string | null {
  return env.GOOGLE_MAPS_JS_KEY?.trim() || env.GOOGLE_MAPS_DEMO_KEY?.trim() || null;
}

export function createEventsHandler(options: { fetcher?: typeof fetch; now?: () => Date } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  type Snapshot = Omit<EventMapResponse, 'mapAvailable'>;
  let cached: { data: Snapshot; expires: number } | undefined;
  let pending: Promise<Snapshot> | undefined;
  // Retain the prototype snapshot cache for repeated and concurrent JSON requests.
  async function snapshot(): Promise<Snapshot> {
    if (cached && cached.expires > now().getTime()) return cached.data;
    if (!pending) pending = (async () => {
      const events = await fetchSydneyEvents({ fetcher, now: now() });
      const points = eventMapPoints(events);
      const mapped = new Set(points.flatMap(p => p.eventIds));
      const data = { events, points, missingCoordinates: events.filter(e => !mapped.has(e.id)).length };
      cached = { data, expires: now().getTime() + 60_000 };
      return data;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    const json = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };
    if (!process.env.TICKETMASTER_API_KEY?.trim()) return json(503, 'Ticketmaster is not configured on the server.');
    try {
      const browserKey = selectGoogleMapsBrowserKey();
      const data = { ...await snapshot(), mapAvailable: Boolean(browserKey) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch {
      // All unexpected errors remain private, including URLs and provider response bodies.
      json(502, 'Ticketmaster events could not be loaded.');
    }
  };
}
