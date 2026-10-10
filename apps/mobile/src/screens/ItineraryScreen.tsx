import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { directions, formatTime, replaceStop } from '@melloway/domain';
import { randomUUID } from 'expo-crypto';
import { Screen } from '../components/Screen';
import { Button, MoodImage, Notice } from '../components/UI';
import PlanMap from '../components/PlanMap';
import { useGeneratePlan } from '../hooks/useGeneratePlan';
import { useAppStore } from '../store/useAppStore';
import { common } from '../theme';

export default function ItineraryScreen() {
  const current = useAppStore(state => state.current);
  const setCurrent = useAppStore(state => state.setCurrent);
  const save = useAppStore(state => state.save);
  const saved = useAppStore(state => state.saved);
  const setStatus = useAppStore(state => state.setStatus);
  const { mutateAsync, isPending } = useGeneratePlan();
  if (!current?.plan) return <Screen><Text style={common.title}>ur next good day is waiting.</Text><Button label="make a plan →" onPress={() => router.replace('/onboarding')} /></Screen>;
  const { plan, candidates, matrix } = current;
  const prefs = plan.prefs;
  const venue = (id: string) => router.push({ pathname: '/venue/[id]', params: { id } });
  async function regenerate() {
    try {
      const next = await mutateAsync({ prefs, seed: Date.now(), previous: plan });
      if (next.plan) { setCurrent(next); setStatus('A fresh plan, made for ur vibe.'); }
      else setStatus('No other plan fits. Try tweaking the details.');
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not regenerate. Your plan is safe.'); }
  }
  function swap(index: number) {
    const next = replaceStop(plan, index, candidates, prefs, matrix);
    if (!next) { setStatus('No replacement fits while keeping the other stops. Try another plan.'); return; }
    setCurrent({ ...current!, plan: { ...plan, ...next, id: randomUUID() } });
    setStatus('One new stop. The rest of ur day stays yours.');
  }
  return <Screen eyebrow="A DAY WITH UR NAME ON IT">
    <Text accessibilityRole="header" style={common.title}>here’s ur {prefs.mode === 'date' ? 'date' : 'hangout'}.</Text><Text style={common.script}>cue the chemistry.</Text>
    <Text style={common.subtitle}>{prefs.partner ? `${prefs.name || 'you'} & ${prefs.partner}` : 'you & good company'} · {prefs.area}{"\n"}{prefs.date} · {prefs.transport}</Text>
    <View style={common.card}><Text style={common.label}>{plan.stops.length} little adventures · {Math.floor(plan.elapsed / 60)}h {Math.round(plan.elapsed % 60)}m</Text><Text style={common.text}>~${plan.cost} AUD per person / ${prefs.budget} budget</Text><Text style={common.fine}>Transport allowance: ${plan.transportAllowance} per person, included above.</Text></View>
    <Notice>{plan.notice}{"\n"}{plan.source === 'estimate' ? 'Travel is a rough geographic estimate, not a calculated road or transit route.' : 'Google route times reflect the request time, not a timetable guaranteed for your outing.'}</Notice>
    {!candidates.length && <Notice>This is a saved snapshot. Try another plan to refresh your options before swapping stops.</Notice>}
    <PlanMap stops={plan.stops} onSelectVenue={venue} />
    {plan.stops.map((stop, index) => <View key={stop.id} style={{ gap: 12 }}>
      {stop.travelFromPrevious && <Text style={common.fine}>↓ {stop.travelFromPrevious.source === 'google' ? 'Google route' : 'rough estimate'} · {stop.travelFromPrevious.minutes} min {prefs.transport.toLowerCase()}{stop.travelFromPrevious.source === 'estimate' ? ` · ${stop.travelFromPrevious.distance.toFixed(1)} km straight-line` : ''}</Text>}
      <View style={common.card}>
        <MoodImage uri={stop.image} source={stop.source} attribution={stop.attribution} />
        <Text style={common.label}>0{index + 1} · {formatTime(stop.arrival)} · {stop.mins} min visit</Text>
        <Text accessibilityRole="header" style={[common.title, { fontSize: 28, lineHeight: 34 }]}>{stop.name}</Text>
        <Text style={common.fine}>{stop.address}</Text>
        <Text style={common.text}>{stop.category} · {stop.cost ? `~$${stop.cost} each` : '$0 allowance'}</Text>
        <Text style={common.fine}>{stop.tags.filter(t => prefs.preferences.includes(t)).join(' + ') || 'a little variety to balance ur day.'}</Text>
        <Button label={`the details · ${stop.name}`} tone="green" onPress={() => venue(stop.id)} />
        <Button label="swap this stop ↻" tone="cream" disabled={isPending || !candidates.length} onPress={() => swap(index)} />
      </View>
    </View>)}
    <Button label="open Google Maps ↗" tone="green" onPress={() => { Linking.openURL(directions(plan.stops, prefs.transport)).catch(() => setStatus('Could not open Google Maps.')); }} />
    <Text style={common.fine}>Google Maps recalculates the real route. Demo stop coordinates are approximate.</Text>
    <Button label={saved.some(p => p.id === plan.id) ? 'saved on this device ♡' : 'save this memory ♡'} onPress={() => save(plan)} />
    <Button label="try another plan ↻" tone="cream" busy={isPending} onPress={regenerate} />
    <Button label="tweak the details" tone="yellow" onPress={() => router.push('/preferences')} />
    <Button label="home, sweet home" tone="cream" onPress={() => router.dismissTo('/')} />
  </Screen>;
}
