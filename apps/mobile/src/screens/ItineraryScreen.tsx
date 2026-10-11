import { useState } from 'react';
import { Linking, Share, Text, View, Modal, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { venuePriceLabel, directions, formatTime, replaceStop, editRoute, addStop, reorderSelected, type Venue, type Plan, type Preferences, type GenerationBundle } from '@melloway/domain';
import { randomUUID } from 'expo-crypto';
import { Screen } from '../components/Screen';
import { Button, MoodImage, Notice, Chips, Field } from '../components/UI';
import PlanMap from '../components/PlanMap';
import { useGeneratePlan } from '../hooks/useGeneratePlan';
import { useAppStore } from '../store/useAppStore';
import { common, colors } from '../theme';
import { sharePlanText } from '../services/sharePlan';
import { prepareEdit, reasonableOrder } from '../services/routeEditing';
import TimeframeEditor from '../components/TimeframeEditor';
import StopExpansion from '../components/StopExpansion';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ItineraryScreen() {
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false), [editBusy, setEditBusy] = useState(false), [timeIndex, setTimeIndex] = useState<number | null>(null);
  const [picker, setPicker] = useState<Awaited<ReturnType<typeof prepareEdit>> | null>(null), [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState(''), [expandedId, setExpandedId] = useState('');
  const [shareError, setShareError] = useState(false);
  const current = useAppStore(state => state.current);
  const setCurrent = useAppStore(state => state.setCurrent);
  const save = useAppStore(state => state.save);
  const saved = useAppStore(state => state.saved);
  const setStatus = useAppStore(state => state.setStatus);
  const status = useAppStore(state => state.status);
  const { mutateAsync, isPending } = useGeneratePlan();
  if (!current?.plan) return <Screen><Text style={common.title}>ur next good day is waiting.</Text><Button label="make a plan →" onPress={() => router.replace('/onboarding')} /></Screen>;
  const { plan } = current;
  const prefs = plan.prefs;
  const venue = (id: string) => { setSelectedId(id); router.push({ pathname: '/venue/[id]', params: { id } }); };
  const selectStop = (id: string, toggle = false) => { setSelectedId(id); setExpandedId(open => toggle && open === id ? '' : id); };
  function commit(next: Plan, options: Awaited<ReturnType<typeof prepareEdit>>, nextPrefs = prefs) {
    setCurrent({ ...current!, ...options, plan: { ...plan, ...next, prefs: nextPrefs, notice: options.notice, id: randomUUID() } });
  }
  async function edit(stops: Venue[], nextPrefs: Preferences = prefs) {
    setEditBusy(true);
    try {
      const options = await prepareEdit(current as GenerationBundle, nextPrefs);
      const next = editRoute(stops, nextPrefs, options.candidates, options.matrix);
      if (!next) { setStatus('This edit doesn’t fit opening hours, timeframes or budget.'); return false; }
      commit(next, options, nextPrefs); setStatus('Route updated.'); return true;
    } catch { setStatus('Couldn’t check this edit. Your route is safe.'); return false; }
    finally { setEditBusy(false); }
  }
  async function order(mode: 'optimise' | 'shuffle') {
    setEditBusy(true);
    try {
      const options = await prepareEdit(current as GenerationBundle, prefs);
      const result = reorderSelected(plan.stops, stops => editRoute(stops, prefs, options.candidates, options.matrix), mode, reasonableOrder);
      if (result.plan) { commit(result.plan, options); setStatus(result.bounded ? 'Best of the checked orders.' : mode === 'shuffle' ? 'Alternative order ready.' : 'Route optimised.'); }
      else setStatus('No other order fits these timeframes and opening hours.');
    } catch { setStatus('Couldn’t check the order. Your route is safe.'); }
    finally { setEditBusy(false); }
  }
  async function openAdd() {
    setEditBusy(true); setQuery('');
    try { setPicker(await prepareEdit(current as GenerationBundle, prefs, true)); }
    catch { setStatus('Couldn’t load nearby options. Your route is safe.'); }
    finally { setEditBusy(false); }
  }
  async function regenerate() {
    try {
      const next = await mutateAsync({ prefs, seed: Date.now(), previous: plan });
      if (next.plan) { setCurrent(next); setStatus('A fresh plan, made for ur vibe.'); }
      else setStatus('No other plan fits. Try tweaking the details.');
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not regenerate. Your plan is safe.'); }
  }
  async function sharePlan() {
    setShareError(false);
    setSharing(true);
    const outcome = await sharePlanText(plan, content => Share.share(content));
    setSharing(false);
    setShareError(outcome === 'failed');
  }
  async function swap(index: number) {
    setEditBusy(true);
    try {
      const options = await prepareEdit(current as GenerationBundle, prefs, true);
      const next = replaceStop(plan, index, options.candidates, prefs, options.matrix);
      if (!next) { setStatus('No replacement fits while keeping the other stops.'); return; }
      commit(next, options); setStatus('One new stop. The rest of ur day stays yours.');
    } catch { setStatus('Couldn’t replace this stop. Your route is safe.'); }
    finally { setEditBusy(false); }
  }
  return <Screen eyebrow="A DAY WITH UR NAME ON IT" bottomActions={<View style={{ gap: 8 }}>
    {!!status && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: colors.yellow, borderRadius: 12 }}>
      <Text style={[common.fine, { flex: 1 }]}>{status}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setStatus('')} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={common.text}>×</Text></Pressable>
    </View>}
    <View style={common.row}>
    <View style={{ flex: 1 }}><Button tone="ink" label={saved.some(p => p.id === plan.id) ? 'saved ♡' : 'lock this in'} disabled={editBusy || isPending} onPress={() => save(plan)} /></View>
    <View style={{ flex: 1 }}><Button label="directions ↗" tone="cream" onPress={() => { Linking.openURL(directions(plan.stops, prefs.transport)).catch(() => setStatus('Could not open Google Maps.')); }} /></View>
  </View></View>}>
    <Text accessibilityRole="header" style={common.title}>here’s ur {prefs.mode === 'date' ? 'date' : 'hangout'}.</Text><Text style={common.script}>cue the chemistry.</Text>
    <Text style={common.subtitle}>{prefs.partner ? `${prefs.name || 'you'} & ${prefs.partner}` : 'you & good company'} · {prefs.area}{"\n"}{prefs.date} · {prefs.transport}</Text>
    <View style={common.card}><Text style={common.label}>{plan.stops.length} little adventures · {Math.floor(plan.elapsed / 60)}h {Math.round(plan.elapsed % 60)}m</Text><Text style={common.text}>~${plan.cost} AUD per person / ${prefs.budget} budget</Text><Text style={common.fine}>Transport allowance: ${plan.transportAllowance} per person, included above.</Text></View>
    <Notice>{plan.notice}{"\n"}{plan.source === 'estimate' ? 'Travel is a rough geographic estimate, not a calculated road or transit route.' : 'Google route times reflect the request time, not a timetable guaranteed for your outing.'}</Notice>
    <Chips label="transport" options={['Not selected', 'Walking', 'Public transport', 'Driving'] as const} value={prefs.transport} onChange={transport => { if (!editBusy && !isPending) void edit(plan.stops, { ...prefs, transport }); }} />
    <View style={common.row}><Button label="optimise route" disabled={editBusy || isPending} tone="cream" onPress={() => { void order('optimise'); }} /><Button label="shuffle route" disabled={editBusy || isPending} tone="cream" onPress={() => { void order('shuffle'); }} /></View>
    <Button label={editing ? 'done editing' : 'edit stops'} tone="cream" onPress={() => setEditing(!editing)} />
    <View style={common.card}>
    {plan.stops.map((stop, index) => <View key={stop.id} style={{ gap: 12 }}>
      {stop.travelFromPrevious && <Text style={common.fine}>↓ {stop.travelFromPrevious.source === 'google' ? 'Google route' : 'rough estimate'} · {stop.travelFromPrevious.minutes} min {prefs.transport === 'Not selected' ? 'planning buffer' : prefs.transport.toLowerCase()}{stop.travelFromPrevious.source === 'estimate' ? ` · ${stop.travelFromPrevious.distance.toFixed(1)} km straight-line` : ''}</Text>}
      <View style={[common.card, selectedId === stop.id && { borderWidth: 2 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`view ${stop.name} details`} accessibilityState={{ expanded: expandedId === stop.id }} aria-expanded={expandedId === stop.id} onPress={() => selectStop(stop.id, true)} style={{ minHeight: 44, gap: 4 }}>
          <Text style={common.label}>{String.fromCharCode(65 + index)} · {stop.name} {expandedId === stop.id ? '⌃' : '⌄'}</Text>
          <Text style={common.fine}>{stop.address}</Text>
          <Text style={common.fine}>{formatTime(stop.arrival)}–{formatTime(stop.arrival + stop.mins)}</Text>
        </Pressable>
        <Button label={`edit ${stop.name} timeframe`} disabled={editBusy || isPending} tone="cream" onPress={() => setTimeIndex(index)} />
        {editing && <View style={common.row}>
          <Button label={`move ${stop.name} up`} disabled={editBusy || isPending || index === 0} tone="cream" onPress={() => { const stops = [...plan.stops]; [stops[index], stops[index - 1]] = [stops[index - 1], stops[index]]; void edit(stops); }} />
          <Button label={`move ${stop.name} down`} disabled={editBusy || isPending || index === plan.stops.length - 1} tone="cream" onPress={() => { const stops = [...plan.stops]; [stops[index], stops[index + 1]] = [stops[index + 1], stops[index]]; void edit(stops); }} />
          <Button label={`remove ${stop.name}`} disabled={editBusy || isPending || plan.stops.length === 1} tone="cream" onPress={() => { void edit(plan.stops.filter(s => s.id !== stop.id)); }} />
        </View>}
        {expandedId === stop.id && <StopExpansion name={stop.name}>
        <MoodImage uri={stop.image} source={stop.source} attribution={stop.attribution} height={156} />
        <Text style={common.text}>{stop.note}</Text>
        <Text style={common.fine}>opening hours · {(() => {
          const date = new Date(`${prefs.date}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + Math.floor(stop.arrival / 1440));
          const windows = stop.weeklyHours ? stop.weeklyHours[date.getUTCDay()] : stop.hours ? [stop.hours] : null;
          return !windows ? 'unconfirmed · check with venue' : !windows.length ? 'closed on this date' : windows.map(w => `${formatTime(w.open)}–${formatTime(w.close % 1440)}${w.close >= 1440 ? ' next day' : ''}`).join(', ') + (stop.source === 'demo' ? ' · sample hours' : ' · confirm before going');
        })()}</Text>
        <Text style={common.fine}>recommended visit · {stop.mins} min</Text>
        <Text style={common.text}>{stop.category} · {venuePriceLabel(stop)}</Text>
        <Text style={common.fine}>why this spot · {stop.tags.filter(t => prefs.preferences.includes(t)).join(' + ') || 'fits this route’s time and budget.'}</Text>
        <Button label={`View Details · ${stop.name}`} tone="green" onPress={() => venue(stop.id)} />

        <Button label={`Replace Stop · ${stop.name}`} tone="cream" disabled={isPending || editBusy} onPress={() => { void swap(index); }} />
        <Button label={`Remove Stop · ${stop.name}`} tone="cream" disabled={isPending || editBusy || plan.stops.length === 1} onPress={() => { void edit(plan.stops.filter(s => s.id !== stop.id)); }} />
        <Button label={`Directions · ${stop.name}`} tone="cream" onPress={() => { Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stop.lat},${stop.lng}`)}${stop.source === 'google' ? `&destination_place_id=${encodeURIComponent(stop.id)}` : ''}`).catch(() => setStatus('Could not open directions.')); }} />
        </StopExpansion>}
      </View>
    </View>)}
    <Button label="add a stop +" tone="yellow" disabled={editBusy || isPending || plan.stops.length >= 14} onPress={() => { void openAdd(); }} />
    <PlanMap stops={plan.stops} selectedId={selectedId} prefs={prefs} onSelectVenue={id => selectStop(id)} />
    </View>
    <Text style={common.fine}>Google Maps recalculates the real route. Demo stop coordinates are approximate.</Text>
    <Button label="Share this plan" tone="cream" busy={sharing} onPress={() => { void sharePlan(); }} />
    {shareError && <Text accessibilityRole="alert" style={common.error}>Could not open sharing. Please try again on a device or browser that supports sharing.</Text>}
    <Button label="try another plan ↻" tone="cream" busy={isPending} disabled={editBusy} onPress={regenerate} />
    <Button label="tweak the details" tone="yellow" onPress={() => router.push('/preferences')} />
    <Button label="home, sweet home" tone="cream" onPress={() => router.dismissTo('/')} />
    {timeIndex !== null && <TimeframeEditor key={plan.stops[timeIndex].id} stop={plan.stops[timeIndex]} busy={editBusy} onClose={() => setTimeIndex(null)} onSave={values => edit(plan.stops.map((s, i) => i === timeIndex ? { ...s, ...values, visitOverride: values.mins } : s))} />}
    <Modal visible={!!picker} animationType="none" presentationStyle="pageSheet" onRequestClose={() => setPicker(null)}>
      <SafeAreaView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={common.title}>add a stop</Text><Field label="search nearby spots" value={query} onChangeText={setQuery} />
        {picker?.candidates.filter(v => !plan.stops.some(s => s.id === v.id) && `${v.name} ${v.address} ${v.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(v => {
          const next = addStop(plan, v, picker.candidates, picker.matrix);
          return <Button key={v.id} label={`${v.name} · ${venuePriceLabel(v)}`} disabled={!next || editBusy} tone="cream" onPress={() => { if (next) { commit(next, picker); setPicker(null); setStatus('Stop added.'); } }} />;
        })}
        <Button label="close suggestions" tone="cream" onPress={() => setPicker(null)} />
      </ScrollView></SafeAreaView>
    </Modal>
  </Screen>;
}
