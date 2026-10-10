import { useEffect, useRef } from 'react';

// Expo web uses the same server-hosted map page as the native WebView.
export default function EventVenueMap({ uri, onError }: { uri: string; onError: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.origin === new URL(uri).origin
        && event.data?.type === 'melloway-map-error') onError();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [uri, onError]);
  return <iframe ref={frame} src={uri} title="Google map of Ticketmaster event venues"
    data-testid="ticketmaster-venue-map" onError={onError}
    style={{ width: '100%', height: '100%', border: 0 }} />;
}
