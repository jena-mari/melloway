import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/Screen';
import { Button, Chips, Field, Notice } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { common } from '../theme';

export default function OnboardingScreen() {
  const draft = useAppStore(state => state.draft);
  const update = useAppStore(state => state.update);
  const [age, setAge] = useState(String(draft.age));
  const [error, setError] = useState('');
  function next() {
    if (!draft.name.trim()) { setError('Tell us your first name, or skip the introduction.'); return; }
    if (!/^\d+$/.test(age) || Number(age) < 18 || Number(age) > 100) { setError('Enter an age between 18 and 100.'); return; }
    update({ name: draft.name.trim(), age: Number(age) });
    router.push('/preferences');
  }
  return <Screen eyebrow="01 / 03 · THE PEOPLE">
    <Text accessibilityRole="header" style={common.title}>hey there,</Text>
    <Text style={common.script}>let’s meet you.</Text>
    <Text style={common.subtitle}>you bring the company. we’ll bring the ideas.</Text>
    <Field label="what’s ur name?" value={draft.name} onChangeText={name => update({ name })} placeholder="your first name" autoComplete="given-name" maxLength={60} />
    <Field label="ur age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
    <Field label="their name (optional)" value={draft.partner} onChangeText={partner => update({ partner })} placeholder="your favourite human" maxLength={60} />
    <Chips label="gender, if you’d like to share" options={['woman', 'man', 'non-binary', 'prefer not to say']} value={draft.gender} onChange={gender => update({ gender })} />
    <Chips label="who are you hanging out with?" options={['my person', 'someone new', 'a friend', 'my friends']} value={draft.companion} onChange={companion => update({ companion })} />
    <Notice>Your profile stays on this device. Age and gender do not affect venue recommendations. No account needed.</Notice>
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
    <Button label="keep going →" onPress={next} />
    <Button label="skip the introduction" tone="cream" onPress={() => { update({ gender: '', partner: '' }); router.push('/preferences'); }} />
  </Screen>;
}
