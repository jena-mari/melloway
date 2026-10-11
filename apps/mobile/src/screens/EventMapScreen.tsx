import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { MatchingSydneyEvent } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import EventVenueMap from '../components/EventVenueMap';
import { eventApiOrigin, eventPreferenceQuery, fetchPreferenceEvents } from '../services/events';
import { useAppStore } from '../store/useAppStore';
import { colors, common } from '../theme';
import { eventListingUrl, formatEventDate, formatEventPrices, openEventListing } from '../services/eventDetails';

function EventDetails({ event }: { event: MatchingSydneyEvent }) {
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
    <Text style={common.fine}>{event.timeWindowFit === 'start-only'
      ? 'Starts within your hours · finish unknown; full attendance may not fit.'
      : 'Advertised start and finish fit your selected hours.'}</Text>
    {event.minimumPriceAUD === null && <Text style={common.fine}>AUD price unknown · budget fit unconfirmed</Text>}
    {url && <Button label="View event / tickets" tone="cream" onPress={() => { void openListing(); }} />}
    {linkError && <Text accessibilityRole="alert" style={common.error}>The event listing could not be opened. Please try again.</Text>}
  </View>;
}

export default function EventMapScreen() {
  const [linkError, setLinkError] = useState(false);
  const [failedMap, setFailedMap] = useState(false);
  const draft = useAppStore(state => state.draft);
  const onboarding = useAppStore(state => state.onboarding);
  const preferences = { ...draft, date: onboarding.date ?? draft.date, time: onboarding.time ?? draft.time,
    budget: Number(onboarding.budgetInput ?? draft.budget) };
  const search = eventPreferenceQuery(preferences);
  const query = useQuery({ queryKey: ['ticketmaster-preferences', search], queryFn: () => fetchPreferenceEvents(search), retry: false });
  const data = query.data;
  const refresh = () => { setFailedMap(false); void query.refetch(); };
  const allEvents = data ? [...data.events, ...data.unknownPriceEvents] : [];
  const openVenue = async (latitude: number, longitude: number) => {
    setLinkError(false);
    try { await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`); }
    catch { setLinkError(true); }
  };
  return <Screen eyebrow="TICKETMASTER · SYDNEY · YOUR PLANNING DETAILS">
    <Text accessibilityRole="header" style={common.title}>event venues, mapped.</Text>
    <Text style={common.subtitle}>{preferences.date || 'Today'} · {preferences.time || '11:00'} Sydney time · {preferences.duration} hours · up to ${preferences.budget} AUD each</Text>
    <Button label="Refresh venues" tone="green" busy={query.isFetching} onPress={refresh} />
    {query.isPending && <View accessibilityLiveRegion="polite" style={styles.loading}>
      <ActivityIndicator color={colors.ink} /><Text style={common.text}>Loading event venues…</Text>
    </View>}
    {query.isError && <Text accessibilityRole="alert" style={common.error}>Event venues could not be loaded. Check the event server connection and try again.</Text>}
    {data && <>
      <Text style={common.label}>{allEvents.length} events · {data.points.length} venue pins</Text>
      <Text accessibilityLiveRegion="polite" style={common.label}>{data.events.length} events within advertised budget · {data.unknownPriceEvents.length} with unknown AUD prices</Text>
      <Text style={common.fine}>Ticketmaster venue coordinates are listed below. These events are separate from your itinerary and are not a route.</Text>
      {!!data.points.length && data.mapAvailable && !failedMap && <View style={styles.map}>
        <EventVenueMap uri={`${eventApiOrigin()}/api/events-map?${search}`} onError={() => setFailedMap(true)} />
      </View>}
      {!data.mapAvailable && !!data.points.length && <Notice>Google Maps is not configured on the event server. Venue coordinates are still listed below.</Notice>}
      {failedMap && data.mapAvailable && <Notice>The Google map preview could not load. Check the connection, browser key and allowed website referrers. Venue coordinates are still listed below.</Notice>}
      {allEvents.length === 0 && <Text style={common.text}>No Ticketmaster events match your selected date, hours, budget and area.</Text>}
      {data.points.length > 10 && <Notice>The map preview shows the first ten venue locations. All matching events remain listed below.</Notice>}
      {data.truncated && <Notice>This is a limited search; more Ticketmaster events may exist.</Notice>}
      {data.missingCoordinates > 0 && <Notice>{data.missingCoordinates} events have no usable venue coordinates and cannot be pinned.</Notice>}
      {data.points.map(point => <View key={point.label} testID={`venue-pin-${point.label}`} style={common.card}>
        <Text accessibilityRole="header" style={common.label}>{point.label}. {point.name ?? 'Venue name unavailable'}</Text>
        {point.address && <Text style={common.text}>{point.address}</Text>}
        <Text selectable style={common.fine}>{point.latitude}, {point.longitude}</Text>
        {allEvents.filter(event => point.eventIds.includes(event.id)).map(event =>
          <EventDetails key={event.id} event={event} />)}
        <Button label={`Open venue ${point.label} in Google Maps`} tone="cream"
          onPress={() => { void openVenue(point.latitude, point.longitude); }} />
      </View>)}
      {allEvents.filter(event => !data.points.some(point => point.eventIds.includes(event.id))).map(event =>
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
  map: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.white },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 24 },
});
