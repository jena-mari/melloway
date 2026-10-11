import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { common } from '../theme';

export default function SavedScreen() {
  const saved = useAppStore(state => state.saved);
  const remove = useAppStore(state => state.remove);
  const setCurrent = useAppStore(state => state.setCurrent);
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
    <Button label="make a new plan →" onPress={() => router.push('/onboarding')} />
  </Screen>;
}
