import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventMapPoint } from '@melloway/domain';
import { selectGoogleMapsBrowserKey } from './events.ts';
import { renderVenueMap } from './eventMap.ts';

interface ItineraryPin { name: string; lat: number; lng: number }

function isPin(value: unknown): value is ItineraryPin {
  if (!value || typeof value !== 'object') return false;
  const pin = value as Partial<ItineraryPin>;
  return typeof pin.name === 'string' && pin.name.trim().length > 0 && pin.name.length <= 200
    && typeof pin.lat === 'number' && Number.isFinite(pin.lat) && pin.lat >= -34.3 && pin.lat <= -33.3
    && typeof pin.lng === 'number' && Number.isFinite(pin.lng) && pin.lng >= 150.5 && pin.lng <= 151.6;
}

/** Display the exact chosen stops, with no search, geocoding or route request. */
export function itineraryMapPoints(value: unknown): EventMapPoint[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 5 || !value.every(isPin)) {
    throw new Error('Invalid itinerary stops.');
  }
  return value.map((pin, index) => ({ label: String(index + 1), name: pin.name,
    latitude: pin.lat, longitude: pin.lng, address: null, eventIds: [] }));
}

const unavailablePage = `<!doctype html><html lang="en"><meta charset="utf-8">
<p role="alert">The Google map preview is unavailable. Your stop cards are still available.</p>
<script>window.parent.postMessage({type:'melloway-map-error'}, document.referrer ? new URL(document.referrer).origin : '*');</script></html>`;

export function createItineraryMapHandler(options: { demoKey?: () => string } = {}) {
  const demoKey = options.demoKey ?? (() => selectGoogleMapsBrowserKey() ?? '');
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, html: string) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' });
      res.end(html);
    };
    let points: EventMapPoint[];
    try {
      const raw = new URL(req.url ?? '', 'http://localhost').searchParams.get('stops');
      if (!raw || raw.length > 5000) return send(400, unavailablePage);
      points = itineraryMapPoints(JSON.parse(raw));
    } catch { return send(400, unavailablePage); }
    // Only the existing browser-visible Demo Key goes into this HTML.
    const key = demoKey();
    if (!key.trim()) return send(503, unavailablePage);
    try { send(200, renderVenueMap(points, key, 'itinerary')); }
    catch { send(502, unavailablePage); }
  };
}
