import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type EventMapResponse, type EventMapPoint } from '@melloway/domain';
import { selectGoogleMapsBrowserKey } from './googleMapsBrowserKey.ts';
export { selectGoogleMapsBrowserKey } from './googleMapsBrowserKey.ts';
import { fetchSydneyEvents } from './ticketmaster.ts';
import { quietMapStyles } from '../shared/mapStyles.ts';

/** This page exposes only a selected browser Maps key, never server provider keys. */
export function renderVenueMap(points: EventMapPoint[], browserKey: string, source: 'events' | 'tiktok' | 'itinerary' = 'events'): string {
  if (!browserKey.trim()) throw new Error('Google Maps browser key is not configured.');
  const itinerary = source === 'itinerary';
  if (!points.length || points.length > (itinerary ? 14 : 10) || points.some(point => !(itinerary ? /^[A-N]$/ : /^[A-J]$/).test(point.label)
    || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) throw new Error('Invalid venue pins.');
  // Treat provider names as data, including names containing closing script tags.
  const pins = JSON.stringify(points.map(p => ({ label: p.label, name: p.name,
    latitude: p.latitude, longitude: p.longitude }))).replace(/</g, '\\u003c');
  const key = encodeURIComponent(browserKey.trim());
  const title = itinerary ? 'Your Melloway stops' : source === 'tiktok' ? 'TikTok café discoveries' : 'Ticketmaster venue map';
  const label = itinerary ? 'Google map of your itinerary stops' : source === 'tiktok' ? 'Google map of cafés discovered on TikTok' : 'Google map of Ticketmaster event venues';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>html,body,#map{height:100%;margin:0}body{font:16px sans-serif;background:#fffdf9;color:#24231f}#error{padding:24px}
${itinerary ? `:root{--pink:#f8a8b9}
.route-pin{box-sizing:border-box;position:relative;width:26px;height:26px;padding:0;display:grid;place-items:center;border:1.5px solid #111;border-radius:50%;background:white;color:#111;filter:drop-shadow(0 2px 3px #1112);cursor:pointer}
.route-pin::before{content:"";position:absolute;z-index:1;width:20px;height:20px;border-radius:50%;background:white}
.route-pin::after{content:"";position:absolute;z-index:0;bottom:-3px;left:calc(50% - 3px);width:6px;height:6px;box-sizing:border-box;background:inherit;border-right:1.5px solid #111;border-bottom:1.5px solid #111;transform:rotate(45deg)}
.pin-numbers{position:relative;z-index:2;color:#111;font:800 13px/1 Outfit,sans-serif}
.route-pin:focus-visible{outline:2px solid #111;outline-offset:4px}
.route-pin.is-selected{background:#111;transform:scale(1.12)}` : ''}</style>
</head><body><div id="map" aria-label="${label}"></div><div id="error" role="alert" hidden></div>
<script>
const pins = ${pins};
const itinerary = ${itinerary};
const parentOrigin = document.referrer ? new URL(document.referrer).origin : null;
function notifyParent(message) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  else window.parent.postMessage(message, parentOrigin || '*');
}
let selectMarker = () => {};
let drawRoutes = () => {};
let fitMap = () => {};
if (itinerary) window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  if (event.data?.type === 'melloway-map-fit') return fitMap();
  if (event.data?.type === 'melloway-map-route') {
    const { paths, transport, routeColor } = event.data;
    if (!transport && Array.isArray(paths) && paths.length === 0) return drawRoutes([], null);
    if (!['Walking', 'Public transport', 'Driving'].includes(transport) || !Array.isArray(paths) || paths.length > pins.length - 1
      || paths.some(leg => !Array.isArray(leg?.path) || leg.path.length < 2 || leg.path.length > 10000
        || leg.path.some(p => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)
          || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180))) return;
    if (typeof routeColor === 'string' && /^#(?:[a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(routeColor))
      document.documentElement.style.setProperty('--pink', routeColor);
    return drawRoutes(paths, transport);
  }
  if (event.data?.type !== 'melloway-map-select') return;
  const index = event.data.index;
  if (Number.isInteger(index) && index >= 0 && index < pins.length) selectMarker(index);
});
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
  notifyParent(message);
}
window.gm_authFailure = () => { complete = false; failMap('auth'); };
window.initVenueMap = async () => {
  try {
    const { Map, Polyline, OverlayView, RenderingType } = await google.maps.importLibrary('maps');
    const { AdvancedMarkerElement, PinElement } = itinerary ? {} : await google.maps.importLibrary('marker');
    const { LatLng } = itinerary ? await google.maps.importLibrary('core') : {};
    const map = new Map(document.getElementById('map'), { center: { lat: pins[0].latitude, lng: pins[0].longitude },
      zoom: itinerary ? 17 : 14, maxZoom: 18,
      ...(itinerary ? { styles: ${JSON.stringify(quietMapStyles)}, renderingType: RenderingType.RASTER,
        disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false }
        : { mapId: 'DEMO_MAP_ID', streetViewControl: false, mapTypeControl: false }) });
    const bounds = new google.maps.LatLngBounds();
    const markers = [];
    for (const [index, pin] of pins.entries()) {
      const position = { lat: pin.latitude, lng: pin.longitude };
      const title = pin.label + '. ' + (pin.name || 'Venue');
      let marker, icon;
      if (itinerary) {
        icon = document.createElement('button');
        icon.type = 'button';
        icon.className = 'route-pin';
        icon.setAttribute('aria-label', title);
        const letter = document.createElement('b');
        letter.className = 'pin-numbers';
        letter.textContent = pin.label;
        icon.append(letter);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:absolute;transform:translate(-50%,-100%)';
        wrapper.title = title;
        wrapper.append(icon);
        const overlay = new OverlayView();
        overlay.onAdd = () => {
          overlay.getPanes().overlayMouseTarget.append(wrapper);
          OverlayView.preventMapHitsAndGesturesFrom(wrapper);
        };
        overlay.draw = () => {
          const pixel = overlay.getProjection()?.fromLatLngToDivPixel(new LatLng(position.lat, position.lng));
          if (pixel) { wrapper.style.left = pixel.x + 'px'; wrapper.style.top = pixel.y + 'px'; }
        };
        overlay.onRemove = () => wrapper.remove();
        overlay.setMap(map);
        marker = { set zIndex(value) { wrapper.style.zIndex = String(value); } };
        icon.addEventListener('click', () => {
          selectMarker(index);
          notifyParent({ type: 'melloway-map-stop', index });
        });
      } else {
        marker = new AdvancedMarkerElement({ map, position, title });
        icon = new PinElement({ glyphText: pin.label, background: '#24231f', borderColor: '#24231f', glyphColor: '#ffffff', scale: 1 });
        marker.append(icon);
      }
      markers.push({ marker, icon });
      if (itinerary) {
        icon.addEventListener('pointerenter', event => {
          if (event.pointerType !== 'touch') notifyParent({ type: 'melloway-map-preview', index });
        });
        icon.addEventListener('focus', () => notifyParent({ type: 'melloway-map-preview', index }));
        icon.addEventListener('pointerleave', () => notifyParent({ type: 'melloway-map-preview-leave' }));
        icon.addEventListener('blur', () => notifyParent({ type: 'melloway-map-preview-leave' }));
      }
      bounds.extend(position);
    }
    selectMarker = index => {
      markers.forEach(({ marker, icon }, i) => {
        if (itinerary) {
          icon.classList.toggle('is-selected', i === index);
          icon.setAttribute('aria-pressed', String(i === index));
        } else icon.background = i === index ? '#f39aad' : '#24231f';
        marker.zIndex = i === index ? 10 : 0;
      });
    };
    if (itinerary) selectMarker(0);
    let lines = [];
    let routePaths = [];
    fitMap = () => {
      const fitted = new google.maps.LatLngBounds();
      const positions = pins.map(pin => ({ lat: pin.latitude, lng: pin.longitude }));
      routePaths.forEach(leg => positions.push(...leg.path));
      positions.forEach(position => fitted.extend(position));
      if (positions.some(position => position.lat !== positions[0].lat || position.lng !== positions[0].lng))
        map.fitBounds(fitted, itinerary ? { top: 76, right: 24, bottom: 24, left: 24 } : 40);
      else { map.setCenter(positions[0]); map.setZoom(itinerary ? 17 : 14); }
    };
    drawRoutes = (paths, transport) => {
      lines.forEach(line => line.setMap(null));
      routePaths = paths;
      lines = paths.flatMap(leg => [
        new Polyline({ map, path: leg.path, strokeColor: '#ffffff', strokeOpacity: .95, strokeWeight: 9, zIndex: 1 }),
        new Polyline({ map, path: leg.path, strokeColor: getComputedStyle(document.documentElement).getPropertyValue('--pink').trim() || '#f8a8b9',
          strokeOpacity: 1, strokeWeight: 5, zIndex: 2 }),
      ]);
      document.getElementById('map').dataset.routeMode = transport;
      document.getElementById('map').dataset.routeLegs = String(paths.length);
      fitMap();
    };
    fitMap();
    complete = true;
    clearTimeout(timer);
    if (itinerary) notifyParent({ type: 'melloway-map-ready' });
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
  let cached: { data: EventMapResponse; expires: number } | undefined;
  let pending: Promise<EventMapResponse> | undefined;
  // A short memory cache keeps the list and map on the same Ticketmaster results.
  async function snapshot(): Promise<EventMapResponse> {
    if (cached && cached.expires > now().getTime()) return cached.data;
    if (!pending) pending = (async () => {
      const events = await fetchSydneyEvents({ fetcher, now: now() });
      const points = eventMapPoints(events);
      const mapped = new Set(points.flatMap(p => p.eventIds));
      const data = { events, points, missingCoordinates: events.filter(e => !mapped.has(e.id)).length,
        mapAvailable: Boolean(process.env.GOOGLE_MAPS_DEMO_KEY?.trim()) };
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
      if (!data.mapAvailable) return json(503, 'Google Maps is not configured. Set GOOGLE_MAPS_JS_KEY or GOOGLE_MAPS_DEMO_KEY on the server.');
      const html = renderVenueMap(data.points, browserKey!);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(html);
    } catch {
      // All unexpected errors remain private, including URLs and provider response bodies.
      json(502, path === '/api/events' ? 'Ticketmaster events could not be loaded.' : 'Google Maps preview could not be loaded.');
    }
  };
}
