import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { SydneyEvent } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import { eventApiOrigin, fetchEventMap } from '../services/events';
import EventVenueMap from '../components/EventVenueMap';
import { colors, common } from '../theme';
import { eventListingUrl, formatEventDate, formatEventPrices, openEventListing } from '../services/eventDetails';

function EventDetails({ event }: { event: SydneyEvent }) {
  const [linkError, setLinkError] = useState(false);
  const url = eventListingUrl(event.url);
  const openListing = async () => {
    setLinkError(false);
    setLinkError(!await openEventListing(url, value => Linking.openURL(value)));
  };
  return <View testID={`event-details-${event.id}`} style={styles.details}>
    <Text style={common.label}>{event.name}</Text>
    <Text style={common.text}>{formatEventDate(event)}</Text>
    {event.category?.trim() && <Text style={common.text}>{event.category.trim()}</Text>}
    <Text style={common.text}>{formatEventPrices(event.priceRanges)}</Text>
    {url && <Button label="View event / tickets" tone="cream" onPress={() => { void openListing(); }} />}
    {linkError && <Text accessibilityRole="alert" style={common.error}>The event listing could not be opened. Please try again.</Text>}
  </View>;
}

export default function EventMapScreen() {
  const [failedMap, setFailedMap] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const query = useQuery({ queryKey: ['ticketmaster-venue-map'], queryFn: () => fetchEventMap(), retry: false });
  const data = query.data;
  const refresh = () => { setFailedMap(false); void query.refetch(); };
  const openVenue = async (latitude: number, longitude: number) => {
    setLinkError(false);
    try { await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`); }
    catch { setLinkError(true); }
  };
  return <Screen eyebrow="TICKETMASTER · SYDNEY · NEXT 30 DAYS">
    <Text accessibilityRole="header" style={common.title}>event venues, mapped.</Text>
    <Text style={common.subtitle}>See where the upcoming Ticketmaster events are happening.</Text>
    <Button label="Refresh venues" tone="green" busy={query.isFetching} onPress={refresh} />
    {query.isPending && <View accessibilityLiveRegion="polite" style={styles.loading}>
      <ActivityIndicator color={colors.ink} /><Text style={common.text}>Loading event venues…</Text>
    </View>}
    {query.isError && <Text accessibilityRole="alert" style={common.error}>Event venues could not be loaded. Check the event server connection and try again.</Text>}
    {data && <>
      <Text accessibilityLiveRegion="polite" style={common.label}>{data.events.length} events · {data.points.length} venue pins</Text>
      {data.points.length > 0 && (data.mapAvailable && !failedMap
        ? <View style={styles.map}><EventVenueMap key={query.dataUpdatedAt}
          uri={`${eventApiOrigin()}/api/events-map?v=${query.dataUpdatedAt}`} onError={() => setFailedMap(true)} /></View>
        : <Notice>The Google map preview is unavailable. Venue coordinates are still listed below.</Notice>)}
      <Text style={common.fine}>Google Demo Key map · coordinates supplied by Ticketmaster. Pins show venues, with shared locations grouped together. They are not verified Google Places matches or a route.</Text>
      {data.events.length === 0 && <Text style={common.text}>No upcoming Sydney events were returned.</Text>}
      {data.missingCoordinates > 0 && <Notice>{data.missingCoordinates} events have no usable venue coordinates and cannot be pinned.</Notice>}
      {data.points.map(point => <View key={point.label} testID={`venue-pin-${point.label}`} style={common.card}>
        <Text accessibilityRole="header" style={common.label}>{point.label}. {point.name ?? 'Venue name unavailable'}</Text>
        {point.address && <Text style={common.text}>{point.address}</Text>}
        <Text selectable style={common.fine}>{point.latitude}, {point.longitude}</Text>
        {data.events.filter(event => point.eventIds.includes(event.id)).map(event =>
          <EventDetails key={event.id} event={event} />)}
        <Button label={`Open venue ${point.label} in Google Maps`} tone="cream"
          onPress={() => { void openVenue(point.latitude, point.longitude); }} />
      </View>)}
      {data.events.filter(event => !data.points.some(point => point.eventIds.includes(event.id))).map(event =>
        <View key={event.id} style={common.card}>
          <EventDetails event={event} />
          <Text style={common.text}>{event.venue?.name ?? 'Venue unavailable'} · Cannot pin without coordinates</Text>
        </View>)}
    </>}
    {linkError && <Text accessibilityRole="alert" style={common.error}>Google Maps could not be opened.</Text>}
  </Screen>;
}
const styles = StyleSheet.create({
  details: { gap: 10 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  map: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.white },
});
