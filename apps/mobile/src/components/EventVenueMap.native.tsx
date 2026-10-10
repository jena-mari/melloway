import { WebView } from 'react-native-webview';

export default function EventVenueMap({ uri, onError }: { uri: string; onError: () => void }) {
  return <WebView source={{ uri }} style={{ flex: 1 }} testID="ticketmaster-venue-map"
    accessibilityLabel="Google map of Ticketmaster event venues"
    onError={onError} onHttpError={onError}
    onMessage={event => {
      try { if (JSON.parse(event.nativeEvent.data)?.type === 'melloway-map-error') onError(); }
      catch { /* Ignore unrelated messages. */ }
    }} />;
}
