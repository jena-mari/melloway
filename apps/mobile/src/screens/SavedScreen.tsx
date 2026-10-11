import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { common } from '../theme';
import { useSavedPlaces } from '../store/useSavedPlaces';

export default function SavedScreen() {
  const saved = useAppStore(state => state.saved);
  const remove = useAppStore(state => state.remove);
  const setCurrent = useAppStore(state => state.setCurrent);
  const places = useSavedPlaces(state => state.places), load = useSavedPlaces(state => state.load), toggle = useSavedPlaces(state => state.toggle);
  const error = useSavedPlaces(state => state.error);
  useEffect(() => { void load(); }, [load]);
  return <Screen eyebrow="GOOD DAYS, KEPT CLOSE">
    <Text accessibilityRole="header" style={common.title}>ur little</Text><Text style={common.script}>memory bank.</Text>
    <Notice>Saved on this device. Supabase sync and cross-device accounts will follow in a later milestone.</Notice>
    {!saved.length && <Text style={common.text}>a little empty, a lot of possibility. make a plan and keep it close.</Text>}
    {saved.map(plan => <View key={plan.id} style={common.card}>
      <Text style={common.label}>{plan.prefs.area} · {plan.prefs.date}</Text>
      <Text style={common.text}>{plan.stops.length} stops · ~${plan.cost} each · {plan.prefs.mode}</Text>
      <Button label="open plan ↗" tone="green" onPress={() => { setCurrent({ plan, candidates: [], matrix: [], notice: plan.notice }); router.push('/itinerary'); }} />
      <Button label="remove from saved plans" tone="cream" onPress={() => remove(plan.id)} />
    </View>)}
    <Text accessibilityRole="header" style={common.label}>saved places</Text>
    {!!error && <><Text accessibilityRole="alert" style={common.error}>{error}</Text><Button label="retry saved places" tone="cream" onPress={() => { void load(); }} /></>}
    {places.map(venue => <View key={venue.id} style={common.card}>
      <Text style={common.label}>{venue.name}</Text><Text style={common.fine}>{venue.address}</Text>
      <Button label={`view ${venue.name}`} tone="green" onPress={() => router.push({ pathname: '/venue/[id]', params: { id: venue.id } })} />
      <Button label={`unsave ${venue.name}`} tone="cream" onPress={() => { void toggle(venue).catch(() => useAppStore.getState().setStatus('Couldn’t remove this saved place.')); }} />
    </View>)}
    <Button label="make a new plan →" onPress={() => router.push('/onboarding')} />
  </Screen>;
}
