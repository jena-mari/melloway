import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import EventVenueMap from '../components/EventVenueMap';
import { fetchTikTokPlaces, tiktokPlacesApiOrigin } from '../services/tiktokPlaces';
import { colors, common } from '../theme';

export default function TikTokPlacesScreen() {
  const [failedMap, setFailedMap] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const query = useQuery({ queryKey: ['tiktok-discovered-places'], queryFn: () => fetchTikTokPlaces(), retry: false });
  const data = query.data;
  const open = async (url: string) => {
    setLinkError(false);
    try { await Linking.openURL(url); } catch { setLinkError(true); }
  };
  return <Screen eyebrow="TIKTOK FINDS · SYDNEY">
    <Text accessibilityRole="header" style={common.title}>places worth a scroll.</Text>
    <Text style={common.subtitle}>Sydney cafés found through TikTok posts, with locations matched to Google Places.</Text>
    <Button label="Refresh places" tone="green" busy={query.isFetching}
      onPress={() => { setFailedMap(false); void query.refetch(); }} />
    {query.isPending && <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.ink} /><Text style={common.text}>Loading places…</Text>
    </View>}
    {query.isError && <Text accessibilityRole="alert" style={common.error}>Places could not be loaded. Check the server connection and try again.</Text>}
    {data && <>
      <Text style={common.label}>{data.places.length} places · {data.places.length - data.missingCoordinates} map pins</Text>
      {data.places.length === 0 && <Notice>No TikTok places saved yet. New discoveries will appear here once their locations match.</Notice>}
      {data.places.length > data.missingCoordinates && data.mapAvailable && !failedMap
        ? <View style={styles.map}><EventVenueMap key={query.dataUpdatedAt} label="Google map of cafés discovered on TikTok"
          testID="tiktok-places-map" uri={`${tiktokPlacesApiOrigin()}/api/tiktok-places-map?v=${query.dataUpdatedAt}`}
          onError={() => setFailedMap(true)} /></View>
        : data.places.length > 0 && <Notice>The map preview is unavailable. You can still open each place in Google Maps.</Notice>}
      {data.places.length > 0 && <Notice>Locations are matched by café name and suburb. TikTok descriptions still need checking before you visit.</Notice>}
      {data.places.map(place => <View key={place.placeId} style={common.card} testID={`tiktok-place-${place.label}`}>
        <Text accessibilityRole="header" style={common.label}>{place.label}. {place.name}</Text>
        <Text style={common.text}>{place.suburb}</Text>
        {place.address && <><Text style={common.text}>{place.address}</Text><Text style={styles.attribution}>Google Maps</Text></>}
        <Text style={common.fine}>TikTok match awaiting review</Text>
        <Button label={`View ${place.name} on TikTok`} tone="cream" onPress={() => { void open(place.sourceUrl); }} />
        <Button label={`Open ${place.name} in Google Maps`} tone="yellow" onPress={() => { void open(place.mapsUri); }} />
      </View>)}
      {data.unmatchedCount > 0 && <Text style={common.fine}>{data.unmatchedCount} {data.unmatchedCount === 1 ? 'discovery' : 'discoveries'} could not be matched clearly and have no map pin.</Text>}
    </>}
    {linkError && <Text accessibilityRole="alert" style={common.error}>The link could not be opened.</Text>}
  </Screen>;
}
const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  map: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.white },
  attribution: { fontSize: 12, color: colors.ink },
});
