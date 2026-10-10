import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { areas, categories, validatePreferences, type Transport } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Chips, Field, MultiChips, Notice } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { common } from '../theme';

export default function PreferencesScreen() {
  const draft = useAppStore(state => state.draft);
  const update = useAppStore(state => state.update);
  const [budget, setBudget] = useState(String(draft.budget));
  const [step, setStep] = useState<'details' | 'vibes'>('details');
  const [error, setError] = useState('');
  function next() {
    const prefs = { ...draft, budget: budget.trim() ? Number(budget) : NaN };
    const problem = validatePreferences(prefs);
    if (problem) { setError(problem); if (step === 'vibes') setStep('details'); return; }
    setError(''); update({ budget: prefs.budget });
    if (step === 'details') setStep('vibes');
    else router.push('/generating');
  }
  return <Screen key={step} eyebrow={step === 'details' ? '02 / 03 · THE DETAILS' : '03 / 03 · THE VIBE'}>
    {step === 'details' ? <>
      <Text accessibilityRole="header" style={common.title}>where to,</Text><Text style={common.script}>{draft.name || 'daydreamer'}?</Text>
      <Text style={common.subtitle}>let’s keep the day within reach. and within budget.</Text>
      <Chips label="where are you starting?" options={Object.keys(areas)} value={draft.area} onChange={area => update({ area })} />
      <Text style={common.fine}>We find stops near this area. The demo schedules travel between stops; it does not include travel from your address or the return trip.</Text>
      <Field label="budget per person · AUD" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="80" maxLength={6} />
      <View style={common.row}>{[0, 20, 50, 80, 120, 200].map(n => <Button key={n} label={`$${n}`} tone={budget === String(n) ? 'pink' : 'cream'} onPress={() => setBudget(String(n))} />)}</View>
      <Field label="the day · YYYY-MM-DD" value={draft.date} onChangeText={date => update({ date })} placeholder="2026-10-10" autoCapitalize="none" maxLength={10} />
      <Field label="start around · HH:MM (24-hour)" value={draft.time} onChangeText={time => update({ time })} placeholder="11:00" autoCapitalize="none" maxLength={5} />
      <Chips<Transport> label="getting around" options={['Walking', 'Public transport', 'Driving']} value={draft.transport} onChange={transport => update({ transport })} />
      <Chips label="how many hours have we got?" options={[3, 4, 5, 6, 8]} value={draft.duration} onChange={duration => update({ duration })} />
      <Notice>Free outings are welcome. Public transport includes a sample $10 allowance per person; driving includes $15. These are budget allowances, not current fares.</Notice>
    </> : <>
      <Text accessibilityRole="header" style={common.title}>so, it’s {draft.mode === 'date' ? 'a date' : 'a hangout'}.</Text><Text style={common.script}>make it ur own.</Text>
      <Text style={common.subtitle}>pick whatever fits. no wrong answers, no limit.</Text>
      {Object.entries(categories).map(([label, options]) => <MultiChips key={label} label={label} options={options} value={draft.preferences} onChange={preferences => update({ preferences })} />)}
      <Notice>{draft.preferences.length ? `${draft.preferences.length} little clues to ur perfect day.` : 'Nothing picked? We’ll keep it varied.'}</Notice>
      <Button label="back to the details" tone="cream" onPress={() => setStep('details')} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
    <Button label={step === 'details' ? 'keep going →' : 'make a little magic ✳'} onPress={next} />
  </Screen>;
}
