import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type EventMapResponse, type EventMapPoint } from '@melloway/domain';
import { fetchSydneyEvents } from './ticketmaster.ts';

/** Select only a browser map key; private provider credentials are never fallbacks. */
export function selectGoogleMapsBrowserKey(env: { GOOGLE_MAPS_JS_KEY?: string; GOOGLE_MAPS_DEMO_KEY?: string } = process.env): string | null {
  return env.GOOGLE_MAPS_JS_KEY?.trim() || env.GOOGLE_MAPS_DEMO_KEY?.trim() || null;
}

/** The selected browser key is visible in this page, unlike private provider keys. */
export function renderVenueMap(points: EventMapPoint[], browserKey: string): string {
  if (!browserKey.trim()) throw new Error('Google Maps browser key is not configured.');
  if (!points.length || points.length > 10 || points.some(point => !/^[A-J]$/.test(point.label)
    || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) throw new Error('Invalid venue pins.');
  // Treat provider names as data, including names containing closing script tags.
  const pins = JSON.stringify(points.map(p => ({ label: p.label, name: p.name,
    latitude: p.latitude, longitude: p.longitude }))).replace(/</g, '\\u003c');
  const key = encodeURIComponent(browserKey.trim());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticketmaster venue map</title>
<style>html,body,#map{height:100%;margin:0}body{font:16px sans-serif;background:#fffdf9;color:#24231f}#error{padding:24px}</style>
</head><body><div id="map" aria-label="Google map of Ticketmaster event venues"></div><div id="error" role="alert" hidden></div>
<script>
const pins = ${pins};
let complete = false;
function failMap(reason = 'load') {
  if (complete) return;
  complete = true;
  clearTimeout(timer);
  document.getElementById('map').hidden = true;
  const error = document.getElementById('error');
  error.hidden = false;
  error.textContent = reason === 'auth'
    ? 'Google Maps authentication failed. Check the configured browser key, Maps JavaScript API access and allowed website referrers. Venue coordinates remain listed in Melloway.'
    : 'The Google map could not load. Check the connection or try again later. Venue coordinates remain listed in Melloway.';
  const message = { type: 'melloway-map-error' };
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  else window.parent.postMessage(message, '*');
}
window.gm_authFailure = () => { complete = false; failMap('auth'); };
window.initVenueMap = async () => {
  try {
    const { Map } = await google.maps.importLibrary('maps');
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker');
    const map = new Map(document.getElementById('map'), { center: { lat: pins[0].latitude, lng: pins[0].longitude },
      zoom: 14, mapId: 'DEMO_MAP_ID', streetViewControl: false, mapTypeControl: false });
    const bounds = new google.maps.LatLngBounds();
    for (const pin of pins) {
      const position = { lat: pin.latitude, lng: pin.longitude };
      const marker = new AdvancedMarkerElement({ map, position, title: pin.label + '. ' + (pin.name || 'Venue') });
      marker.append(new PinElement({ glyphText: pin.label, background: '#24231f', borderColor: '#24231f', glyphColor: '#ffffff' }));
      bounds.extend(position);
    }
    if (pins.length > 1) map.fitBounds(bounds, 40);
    complete = true;
    clearTimeout(timer);
  } catch { failMap(); }
};
const timer = setTimeout(failMap, 20000);
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${key}&amp;loading=async&amp;libraries=marker&amp;callback=initVenueMap" onerror="failMap()"></script>
</body></html>`;
}

export function createEventMapHandler(options: { fetcher?: typeof fetch; now?: () => Date } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  type Snapshot = Omit<EventMapResponse, 'mapAvailable'>;
  let cached: { data: Snapshot; expires: number } | undefined;
  let pending: Promise<Snapshot> | undefined;
  // A short memory cache keeps the list and map on the same Ticketmaster results.
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
    const path = req.url?.split('?')[0];
    const json = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };
    if (!process.env.TICKETMASTER_API_KEY?.trim()) return json(503, 'Ticketmaster is not configured on the server.');
    try {
      const browserKey = selectGoogleMapsBrowserKey();
      const data = { ...await snapshot(), mapAvailable: Boolean(browserKey) };
      if (path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(data));
      }
      if (!data.points.length) return json(404, 'No event venues with coordinates are available.');
      if (!browserKey) return json(503, 'Google Maps is not configured. Set GOOGLE_MAPS_JS_KEY or GOOGLE_MAPS_DEMO_KEY on the server.');
      const html = renderVenueMap(data.points, browserKey);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(html);
    } catch {
      // All unexpected errors remain private, including URLs and provider response bodies.
      json(502, path === '/api/events' ? 'Ticketmaster events could not be loaded.' : 'Google Maps preview could not be loaded.');
    }
  };
}
