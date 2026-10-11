import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoutePaths } from '../services/itineraryRoutes.ts';
import MapSpotPreview from './MapSpotPreview';
import MapRoutePreview from './MapRoutePreview';

interface StopPin { id: string; name: string; lat: number; lng: number }
interface GoogleStopMapProps {
  stops: StopPin[];
  selectedStopId?: string;
  onSelectStop?: (id: string) => void;
  directionsUrl: string;
  routePaths?: RoutePaths['paths'];
  transport?: RoutePaths['transport'];
  resetView?: number;
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export default function GoogleStopMap({ stops, selectedStopId, onSelectStop, directionsUrl, routePaths, transport, resetView }: GoogleStopMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [routePreviewIndex, setRoutePreviewIndex] = useState<number | null>(null);
  const [routePinned, setRoutePinned] = useState(false);
  const pinnedPreview = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function keepPreview() { if (closeTimer.current) clearTimeout(closeTimer.current); }
  function closePreview() { keepPreview(); pinnedPreview.current = false; setRoutePinned(false); setPreviewIndex(null); setRoutePreviewIndex(null); }
  function pinPreview() { keepPreview(); pinnedPreview.current = true; setRoutePinned(true); }
  function leavePreview() { keepPreview(); if (!pinnedPreview.current) closeTimer.current = setTimeout(closePreview, 250); }
  const src = useMemo(() => `${apiBase}/api/itinerary-map?${new URLSearchParams({
    stops: JSON.stringify(stops.map(({ name, lat, lng }) => ({ name, lat, lng }))),
  })}`, [stops]);
  const origin = new URL(src, window.location.href).origin;
  const selectedIndex = stops.findIndex(stop => stop.id === selectedStopId);

  useEffect(() => {
    setStatus('loading');
    closePreview();
    const timeout = window.setTimeout(() => setStatus('error'), 25000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (event.data?.type === 'melloway-map-ready') {
        window.clearTimeout(timeout);
        setStatus('ready');
      } else if (event.data?.type === 'melloway-map-error') {
        window.clearTimeout(timeout);
        setStatus('error');
      }
    };
    window.addEventListener('message', receive);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [src, origin]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin
        || !['melloway-map-stop', 'melloway-map-preview', 'melloway-map-preview-leave', 'melloway-map-route-preview',
          'melloway-map-preview-close'].includes(event.data?.type)) return;
      if (event.data.type === 'melloway-map-preview-close') { closePreview(); return; }
      if (event.data.type === 'melloway-map-preview-leave') { leavePreview(); return; }
      const index: unknown = event.data.index;
      if (typeof index !== 'number' || !Number.isInteger(index) || !stops[index]) return;
      if (event.data.type === 'melloway-map-route-preview') {
        if (transport !== 'Public transport' || !routePaths?.some(leg => leg.fromIndex === index)) return;
        const pinned = event.data.pinned === true;
        if (pinnedPreview.current && !pinned) return;
        keepPreview(); pinnedPreview.current = pinned; setRoutePinned(pinned); setPreviewIndex(null); setRoutePreviewIndex(index);
      } else if (event.data.type === 'melloway-map-preview') {
        if (pinnedPreview.current) return;
        keepPreview(); setRoutePreviewIndex(null); setPreviewIndex(index);
      }
      else { closePreview(); onSelectStop?.(stops[index].id); }
    };
    window.addEventListener('message', receive);
    return () => { keepPreview(); window.removeEventListener('message', receive); };
  }, [stops, onSelectStop, origin, routePaths, transport]);

  useEffect(() => {
    if (status === 'ready' && selectedIndex >= 0) frame.current?.contentWindow?.postMessage({
      type: 'melloway-map-select', index: selectedIndex,
    }, origin);
  }, [status, selectedIndex, origin]);

  useEffect(() => {
    closePreview();
    if (status === 'ready') frame.current?.contentWindow?.postMessage({
      type: 'melloway-map-route', paths: routePaths || [], transport,
      routeColor: frame.current ? getComputedStyle(frame.current).getPropertyValue('--pink').trim() : undefined,
    }, origin);
  }, [status, routePaths, transport, origin]);
  useEffect(() => {
    if (status === 'ready') frame.current?.contentWindow?.postMessage({ type: 'melloway-map-fit' }, origin);
  }, [resetView, status, origin]);

  if (status === 'error') return <div className="map-unavailable" role="status">
    <span className="map-unavailable-dots" aria-hidden="true">{stops.map((_, i) => String.fromCharCode(65 + i)).join(' · ')}</span>
    <p>The map couldn’t load. Your stops are still below.</p>
    <a href={directionsUrl} target="_blank" rel="noreferrer">open Google Maps ↗</a>
  </div>;
  const routePreview = routePreviewIndex === null ? undefined : routePaths?.find(leg => leg.fromIndex === routePreviewIndex);
  return <div className="google-stop-map" onPointerLeave={leavePreview}
    onKeyDown={event => { if (event.key === 'Escape' && (previewIndex !== null || routePreview)) { event.preventDefault(); event.stopPropagation(); closePreview(); } }}>
    <iframe ref={frame} className="google-route-map" src={src} title="Google map of your itinerary stops"
      onError={() => setStatus('error')} />
    {status === 'loading' && <p className="map-status" role="status">bringing ur stops into view…</p>}
    {status === 'ready' && (routePreview || previewIndex !== null && stops[previewIndex]) && <div className={`map-preview-layer${routePreview ? ' map-route-preview-layer' : ''}`}
      onPointerEnter={keepPreview} onPointerLeave={leavePreview} onFocus={keepPreview}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) leavePreview(); }}>
      {routePreview ? <MapRoutePreview leg={routePreview} stops={stops} onClose={closePreview} onPin={pinPreview} pinned={routePinned} />
        : <MapSpotPreview points={[stops[previewIndex!]]} onSelect={(id: string) => { closePreview(); onSelectStop?.(id); }} onClose={closePreview} />}
    </div>}
  </div>;
}
