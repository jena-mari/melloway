import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { venues, selectVenues } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, MoodImage, Notice } from '../components/UI';
import VenueMediaGallery from '../components/VenueMediaGallery';
import PlaceActions from '../components/PlaceActions';
import { useAppStore } from '../store/useAppStore';
import { mobileConfig } from '../services/config';
import { createGoogleProvider } from '../services/api';
import { common } from '../theme';

export default function ExploreScreen() {
  const current = useAppStore(state => state.current), draft = useAppStore(state => state.draft);
  const [expanded, setExpanded] = useState(''), [error, setError] = useState('');
  const config = mobileConfig(), prefs = current?.plan?.prefs || draft;
  const query = useQuery({ queryKey: ['explore-places', prefs], queryFn: async () => {
    if (config.apiUrl) return createGoogleProvider(config.apiUrl).venues(prefs);
    return current?.candidates.length ? current.candidates : venues;
  }, retry: false });
  const choices = selectVenues(query.data || [], prefs);
  return <Screen>
    <Text accessibilityRole="header" style={common.script}>explore.</Text>
    {config.mode === 'demo' && <Notice>Demo venues · sample prices, imagery and locations.</Notice>}
    {query.isFetching && <Text accessibilityLiveRegion="polite" style={common.text}>finding nearby spots…</Text>}
    {query.isError && <><Text style={common.error}>Couldn’t load nearby places.</Text><Button label="retry nearby places" onPress={() => { void query.refetch(); }} /></>}
    {!query.isFetching && !choices.length && !query.isError && <Text style={common.text}>Try another area or budget to find more spots.</Text>}
    {choices.map(venue => <View key={venue.id} style={common.card}>
      <MoodImage uri={venue.image} source={venue.source} attribution={venue.attribution} />
      <Text accessibilityRole="header" style={common.label}>{venue.name}</Text>
      <Text style={common.fine}>{venue.area} · {venue.address}</Text>
      <Text style={common.fine}>~${venue.cost} each · {venue.mins} min</Text>
      <Text style={common.text}>{venue.note}</Text>
      <Text style={common.fine}>{venue.tags.filter(tag => prefs.preferences.includes(tag)).join(' · ') || venue.category}</Text>
      <PlaceActions venue={venue} />
      <Button label={expanded === venue.id ? 'hide posts' : `see the vibe at ${venue.name}`} tone="cream" onPress={() => setExpanded(expanded === venue.id ? '' : venue.id)} />
      {expanded === venue.id && <VenueMediaGallery key={venue.id} venue={venue} />}
      <Button label={`show ${venue.name} on map`} tone="cream" onPress={() => {
        void Linking.openURL(venue.mapsUri || `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`).catch(() => setError('Couldn’t open the map.'));
      }} />
    </View>)}
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
  </Screen>;
}
