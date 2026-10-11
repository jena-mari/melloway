import { useEffect, useMemo, useRef, useState } from 'react';

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
  const src = useMemo(() => `${apiBase}/api/itinerary-map?${new URLSearchParams({
    stops: JSON.stringify(stops.map(({ name, lat, lng }) => ({ name, lat, lng }))),
  })}`, [stops]);
  const origin = new URL(src, window.location.href).origin;
  const selectedIndex = stops.findIndex(stop => stop.id === selectedStopId);

  useEffect(() => {
    setStatus('loading');
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
        || event.data?.type !== 'melloway-map-stop') return;
      const index: unknown = event.data.index;
      if (typeof index === 'number' && Number.isInteger(index) && stops[index]) onSelectStop?.(stops[index].id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
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
  return <div className="google-stop-map">
    <iframe ref={frame} className="google-route-map" src={src} title="Google map of your itinerary stops"
      onError={() => setStatus('error')} />
    {status === 'loading' && <p className="map-status" role="status">bringing ur stops into view…</p>}
  </div>;
}
