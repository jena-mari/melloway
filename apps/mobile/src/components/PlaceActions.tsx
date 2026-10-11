import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { addStop, mediaVenueKey, demoMatrix, type Venue } from '@melloway/domain';
import { useAppStore } from '../store/useAppStore';
import { useSavedPlaces } from '../store/useSavedPlaces';
import { createGoogleProvider } from '../services/api';
import { mobileConfig } from '../services/config';
import { Button } from './UI';
import { common } from '../theme';

export default function PlaceActions({ venue }: { venue: Venue }) {
  const current = useAppStore(state => state.current), setCurrent = useAppStore(state => state.setCurrent);
  const places = useSavedPlaces(state => state.places), load = useSavedPlaces(state => state.load), loaded = useSavedPlaces(state => state.loaded), toggle = useSavedPlaces(state => state.toggle);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const loadError = useSavedPlaces(state => state.error);
  useEffect(() => { if (!loaded) void load(); }, [load, loaded]);
  const saved = places.some(place => place.id === venue.id || mediaVenueKey(place) === mediaVenueKey(venue));
  const included = current?.plan?.stops.some(stop => stop.id === venue.id || mediaVenueKey(stop) === mediaVenueKey(venue));
  async function add() {
    if (!current?.plan) { setMessage('Make a plan first, then add this saved place.'); return; }
    setBusy(true); setMessage('Checking hours, budget & route…');
    try {
      if (!Number.isFinite(venue.cost) || venue.cost < 0 || !Number.isFinite(venue.mins) || venue.mins <= 0) throw new Error('Its price or visit length needs confirming before adding this spot.');
      if (!venue.hours && !venue.weeklyHours) throw new Error('Opening hours need confirming before adding this spot.');
      const candidates = [...current.plan.stops.map(stop => ({ ...stop, score: 0 })), { ...venue, score: 0 }];
      const config = mobileConfig();
      let matrix = demoMatrix(candidates, current.plan.prefs.transport), notice = current.notice;
      if (config.apiUrl && current.plan.prefs.transport !== 'Not selected' && candidates.some(v => v.source === 'google')) {
        try { matrix = await createGoogleProvider(config.apiUrl).matrix(candidates, current.plan.prefs); }
        catch { notice += ' Travel uses geographic estimates.'; }
      }
      const next = addStop(current.plan, venue, candidates, matrix);
      if (!next) throw new Error('This spot doesn’t fit your current time or budget. Save it, or edit your day first.');
      if (useAppStore.getState().current !== current) throw new Error('Your day changed while checking. Try again.');
      setCurrent({ ...current, candidates, matrix, notice, plan: { ...current.plan, ...next, notice } });
      setMessage('Added to your day.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Couldn’t update the route.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    {!!loadError && <><Text style={common.error}>{loadError}</Text><Button label="retry saved places" tone="cream" onPress={() => { void load(); }} /></>}
    <Button label={saved ? `unsave ${venue.name}` : `save ${venue.name}`} tone="cream" disabled={!loaded || busy}
      onPress={() => { void toggle(venue).then(() => setMessage('')).catch(() => setMessage('Couldn’t save this place. Retry.')); }} />
    <Button label={included ? 'in your day' : 'add to itinerary'} tone="yellow" disabled={included || busy} busy={busy} onPress={() => { void add(); }} />
    {!!message && <Text accessibilityLiveRegion="polite" style={common.fine}>{message}</Text>}
  </View>;
}
