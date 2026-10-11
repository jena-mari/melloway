import { useEffect, useMemo, useRef, useState } from 'react';
import MapSpotPreview from './MapSpotPreview';

interface StopPin { id: string; name: string; lat: number; lng: number }
interface GoogleStopMapProps {
  stops: StopPin[];
  selectedStopId?: string;
  onSelectStop?: (id: string) => void;
  directionsUrl: string;
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export default function GoogleStopMap({ stops, selectedStopId, onSelectStop, directionsUrl }: GoogleStopMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function keepPreview() { if (closeTimer.current) clearTimeout(closeTimer.current); }
  function closePreview() { keepPreview(); setPreviewIndex(null); }
  function leavePreview() { keepPreview(); closeTimer.current = setTimeout(() => setPreviewIndex(null), 250); }
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
        || !['melloway-map-stop', 'melloway-map-preview', 'melloway-map-preview-leave'].includes(event.data?.type)) return;
      if (event.data.type === 'melloway-map-preview-leave') { leavePreview(); return; }
      const index: unknown = event.data.index;
      if (typeof index !== 'number' || !Number.isInteger(index) || !stops[index]) return;
      if (event.data.type === 'melloway-map-preview') { keepPreview(); setPreviewIndex(index); }
      else { closePreview(); onSelectStop?.(stops[index].id); }
    };
    window.addEventListener('message', receive);
    return () => { keepPreview(); window.removeEventListener('message', receive); };
  }, [stops, onSelectStop, origin]);

  useEffect(() => {
    if (status === 'ready' && selectedIndex >= 0) frame.current?.contentWindow?.postMessage({
      type: 'melloway-map-select', index: selectedIndex,
    }, origin);
  }, [status, selectedIndex, origin]);

  if (status === 'error') return <div className="map-unavailable" role="status">
    <span className="map-unavailable-dots" aria-hidden="true">{stops.map((_, i) => i + 1).join(' · ')}</span>
    <p>The map couldn’t load. Your stops are still below.</p>
    <a href={directionsUrl} target="_blank" rel="noreferrer">open Google Maps ↗</a>
  </div>;
  return <div className="google-stop-map" onKeyDown={event => { if (event.key === 'Escape' && previewIndex !== null) { event.stopPropagation(); closePreview(); } }}>
    <iframe ref={frame} className="google-route-map" src={src} title="Google map of your itinerary stops"
      onError={() => setStatus('error')} />
    {status === 'loading' && <p className="map-status" role="status">bringing ur stops into view…</p>}
    {status === 'ready' && previewIndex !== null && stops[previewIndex] && <div className="map-preview-layer"
      onPointerEnter={keepPreview} onPointerLeave={leavePreview} onFocus={keepPreview}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) leavePreview(); }}>
      <MapSpotPreview points={[stops[previewIndex]]} onSelect={(id: string) => { closePreview(); onSelectStop?.(id); }} onClose={closePreview} />
    </div>}
  </div>;
}
