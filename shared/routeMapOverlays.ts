import type { RouteLeg } from './routeJourney.ts';

// Shared by the browser map and its server-rendered iframe.
export const transitMapStyles = `
.map-route-journey-pin,.map-transit-pin{box-sizing:border-box;display:grid;place-items:center;min-width:36px;min-height:36px;padding:4px 8px;border:1px solid #111;border-radius:999px;background:#fffdf9;color:#111;box-shadow:0 2px 6px #0002;font:700 11px/1.2 Outfit,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent}
.map-transit-pin{min-width:28px;min-height:28px;padding:3px;background:#e9f2ee;font-size:16px}
.map-route-journey-pin:focus-visible,.map-transit-pin:focus-visible{outline:2px solid #111;outline-offset:3px}
`;

interface OverlayOptions {
  maps: any; core: any; map: any; paths: RouteLeg[]; transport?: string | null; color: string;
  points: { name?: string | null }[];
  onPreview: (fromIndex: number, pinned: boolean) => void;
  onLeave: () => void; onClose: () => void;
}

/** Self-contained so the same interaction code can be embedded in the iframe. */
export function drawRouteOverlays({ maps, core, map, paths, transport, color, points, onPreview, onLeave, onClose }: OverlayOptions) {
  const lines: any[] = [], overlays: any[] = [], listeners: any[] = [];
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  function clearHover() { clearTimeout(hoverTimer); hoverTimer = undefined; }
  function show(fromIndex: number, pinned = false) { clearHover(); onPreview(fromIndex, pinned); }
  function hover(fromIndex: number) {
    clearHover();
    hoverTimer = setTimeout(() => { hoverTimer = undefined; onPreview(fromIndex, false); }, 180);
  }
  function leave() { clearHover(); onLeave(); }
  function pin(position: { lat: number; lng: number }, label: string, title: string, className: string, fromIndex: number) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = className;
    element.textContent = label; element.title = title; element.setAttribute('aria-label', title);
    element.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') hover(fromIndex); });
    element.addEventListener('pointerleave', leave);
    // Defer focus previews to hover on desktop clicks; keyboard focus still opens immediately.
    element.addEventListener('focus', () => { if (hoverTimer === undefined) show(fromIndex); });
    element.addEventListener('blur', leave);
    element.addEventListener('click', event => { event.stopPropagation(); show(fromIndex, true); });
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;transform:translate(-50%,-50%);z-index:200';
    wrapper.append(element);
    const overlay = new maps.OverlayView();
    overlay.onAdd = () => {
      overlay.getPanes().overlayMouseTarget.append(wrapper);
      maps.OverlayView.preventMapHitsAndGesturesFrom(wrapper);
    };
    overlay.draw = () => {
      const pixel = overlay.getProjection()?.fromLatLngToDivPixel(new core.LatLng(position.lat, position.lng));
      if (pixel) { wrapper.style.left = `${pixel.x}px`; wrapper.style.top = `${pixel.y}px`; }
    };
    overlay.onRemove = () => wrapper.remove();
    overlay.setMap(map); overlays.push(overlay);
  }
  for (const leg of paths) {
    lines.push(new maps.Polyline({ map, path: leg.path, strokeColor: '#ffffff', strokeOpacity: .95, strokeWeight: 9, zIndex: 1, clickable: false }),
      new maps.Polyline({ map, path: leg.path, strokeColor: color, strokeOpacity: 1, strokeWeight: 5, zIndex: 2, clickable: false }));
    if (transport !== 'Public transport') continue;
    // A wider invisible line makes both hover and touch easier to target.
    const hit = new maps.Polyline({ map, path: leg.path, strokeOpacity: 0, strokeWeight: 22, zIndex: 3, clickable: true });
    lines.push(hit);
    listeners.push(hit.addListener('mouseover', () => hover(leg.fromIndex)),
      hit.addListener('mouseout', leave), hit.addListener('click', () => show(leg.fromIndex, true)));
    const from = points[leg.fromIndex]?.name || String.fromCharCode(65 + leg.fromIndex);
    const to = points[leg.toIndex]?.name || String.fromCharCode(65 + leg.toIndex);
    const title = `Transport from ${from} to ${to}`;
    pin(leg.path[Math.floor(leg.path.length / 2)], `${String.fromCharCode(65 + leg.fromIndex)} → ${String.fromCharCode(65 + leg.toIndex)}`,
      title, 'map-route-journey-pin', leg.fromIndex);
    const stops = new Map<string, { position: { lat: number; lng: number }; labels: string[]; titles: string[] }>();
    for (const step of (Array.isArray(leg.journey?.steps) ? leg.journey.steps.slice(0, 80) : [])) {
      if (step.mode !== 'transit') continue;
      for (const [stop, label, action] of [[step.departureStop, '↑', 'Board at'], [step.arrivalStop, '↓', 'Get off at']] as const) {
        const position = stop?.location;
        if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)
          || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180 || typeof stop.name !== 'string' || stop.name.length > 200) continue;
        const key = `${position.lat},${position.lng}`;
        const entry = stops.get(key) || { position, labels: [], titles: [] };
        if (!entry.labels.includes(label)) entry.labels.push(label);
        const stopTitle = `${action} ${stop.name}`;
        if (!entry.titles.includes(stopTitle)) entry.titles.push(stopTitle);
        stops.set(key, entry);
      }
    }
    stops.forEach(({ position, labels, titles }) => pin(position, labels.length > 1 ? '↕' : labels[0],
      `${titles.join(' · ')}. ${title}`, 'map-transit-pin', leg.fromIndex));
  }
  if (transport === 'Public transport') listeners.push(map.addListener('click', () => { clearHover(); onClose(); }));
  return () => {
    clearHover();
    listeners.forEach(listener => listener.remove());
    overlays.forEach(overlay => overlay.setMap(null));
    lines.forEach(line => line.setMap(null));
  };
}
