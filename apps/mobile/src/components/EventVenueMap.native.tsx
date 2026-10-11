import { WebView } from 'react-native-webview';

export default function EventVenueMap({ uri, onError, label = 'Google map of Ticketmaster event venues', testID = 'ticketmaster-venue-map' }:
  { uri: string; onError: () => void; label?: string; testID?: string }) {
  return <WebView source={{ uri }} style={{ flex: 1 }} testID={testID}
    accessibilityLabel={label}
    onError={onError} onHttpError={onError}
    onMessage={event => {
      try { if (JSON.parse(event.nativeEvent.data)?.type === 'melloway-map-error') onError(); }
      catch { /* Ignore unrelated messages. */ }
    }} />;
}
