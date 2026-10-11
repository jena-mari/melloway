import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { MatchingSydneyEvent } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import { eventPreferenceQuery, fetchPreferenceEvents } from '../services/events';
import { useAppStore } from '../store/useAppStore';
import { colors, common } from '../theme';

function EventDetails({ event }: { event: MatchingSydneyEvent }) {
  const [linkError, setLinkError] = useState(false);
  const start = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.startDateTime!));
  const price = event.minimumPriceAUD === null ? 'AUD price unknown · budget fit unconfirmed'
    : `Advertised from $${event.minimumPriceAUD} AUD per person · fees and availability unconfirmed`;
  let bookingUrl: string | null = null;
  try { if (event.url && new URL(event.url).protocol === 'https:') bookingUrl = event.url; } catch { /* No unsafe links. */ }
  const openListing = async () => {
    if (!bookingUrl) return;
    setLinkError(false);
    try { await Linking.openURL(bookingUrl); } catch { setLinkError(true); }
  };
  return <View style={{ gap: 8 }}>
    <Text style={common.label}>{event.name}</Text>
    <Text style={common.text}>{start} · Sydney time</Text>
    <Text style={common.fine}>{event.timeWindowFit === 'start-only'
      ? 'Starts within your hours · finish unknown; full attendance may not fit.'
      : 'Advertised start and finish fit your selected hours.'}</Text>
    <Text style={common.text}>{price}</Text>
    {bookingUrl && <Button label="View event / tickets" tone="cream" onPress={() => { void openListing(); }} />}
    {linkError && <Text accessibilityRole="alert" style={common.error}>The ticket listing could not be opened.</Text>}
  </View>;
}

export default function EventMapScreen() {
  const [linkError, setLinkError] = useState(false);
  const draft = useAppStore(state => state.draft);
  const onboarding = useAppStore(state => state.onboarding);
  const preferences = { ...draft, date: onboarding.date ?? draft.date, time: onboarding.time ?? draft.time,
    budget: Number(onboarding.budgetInput ?? draft.budget) };
  const search = eventPreferenceQuery(preferences);
  const query = useQuery({ queryKey: ['ticketmaster-preferences', search], queryFn: () => fetchPreferenceEvents(search), retry: false });
  const data = query.data;
  const refresh = () => { void query.refetch(); };
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
      <Text accessibilityLiveRegion="polite" style={common.label}>{data.events.length} events within advertised budget · {data.unknownPriceEvents.length} with unknown AUD prices</Text>
      <Text style={common.fine}>Ticketmaster venue coordinates are listed below. These events are separate from your itinerary and are not a route.</Text>
      {data.events.length === 0 && <Text style={common.text}>No Ticketmaster events match your selected date, hours, budget and area.</Text>}
      {data.truncated && <Notice>This is a limited search; more Ticketmaster events may exist.</Notice>}
      {data.missingCoordinates > 0 && <Notice>{data.missingCoordinates} events have no usable venue coordinates and cannot be pinned.</Notice>}
      {data.points.filter(point => data.events.some(event => point.eventIds.includes(event.id))).map(point => <View key={point.label} testID={`venue-pin-${point.label}`} style={common.card}>
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
      {!!data.unknownPriceEvents.length && <Text accessibilityRole="header" style={common.label}>Price unknown · check tickets</Text>}
      {data.unknownPriceEvents.map(event => <View key={event.id} style={common.card}>
        <EventDetails event={event} />
        <Text style={common.text}>{event.venue?.name ?? 'Venue unavailable'}</Text>
        {event.venue?.latitude != null && event.venue.longitude != null && <>
          <Text selectable style={common.fine}>{event.venue.latitude}, {event.venue.longitude}</Text>
          <Button label={`Open ${event.venue.name ?? 'venue'} in Google Maps`} tone="cream"
            onPress={() => { void openVenue(event.venue!.latitude!, event.venue!.longitude!); }} />
        </>}
      </View>)}
    </>}
    {linkError && <Text accessibilityRole="alert" style={common.error}>Google Maps could not be opened.</Text>}
  </Screen>;
}
const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 12, paddingVertical: 24 },
});
