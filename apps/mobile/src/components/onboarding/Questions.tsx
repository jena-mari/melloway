import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Preferences } from '@melloway/domain';
import { activityOptions, diningOptions, foodOptions, hangoutOptions, onboardingDate, type OnboardingAnswers, type Question } from '../../services/onboarding';
import { colors, fonts } from '../../theme';
import { Choices, Input, Invitation, Prompt, onboardingStyles } from './Controls';
import AreaSearch from './AreaSearch';
import DateCalendar from './DateCalendar';
import TimePicker from './TimePicker';
import Ideas from './Ideas';

interface Props {
  question: Question;
  draft: Preferences;
  answers: OnboardingAnswers;
  update: (values: Partial<Preferences>) => void;
  updateAnswers: (values: Partial<OnboardingAnswers>) => void;
  onExtras: () => void;
}
export default function Questions({ question: { step, q }, draft: d, answers: a, update, updateAnswers, onExtras }: Props) {
  const [complete, setComplete] = useState(step === 'profile' && !!d.name);
  const toggle = (tag: string) => update({ preferences: d.preferences.includes(tag) ? d.preferences.filter(t => t !== tag) : [...d.preferences, tag] });
  const prompt = (title: string, copy?: string) => <Prompt title={title} copy={copy} complete={complete} />;
  let content;
  if (step === 'profile') content = <>
    {prompt('hey there,', 'what’s ur name?')}
    <Input label="what’s ur name?" placeholder="insert name here" value={d.name} maxLength={60} autoComplete="given-name" textContentType="givenName" onFocus={() => setComplete(true)} onChangeText={name => update({ name })} />
  </>;
  else if (step === 'about') content = q === 0 ? <>
    {prompt(`cool name,\n${d.name || 'new friend'}.`, 'how old are u?')}
    <Text style={onboardingStyles.label}>age</Text>
    <View style={styles.entry}>
      <Input label="age" value={a.ageInput ?? String(d.age)} placeholder="e.g. 24" keyboardType="number-pad" maxLength={3} onFocus={() => setComplete(true)} onChangeText={ageInput => updateAnswers({ ageInput })} style={styles.entryInput} />
      <Text style={styles.unit}>years old</Text>
    </View>
  </> : <>
    {prompt('and ur gender?')}<Text style={onboardingStyles.label}>gender <Text style={onboardingStyles.fine}>optional</Text></Text>
    <Choices options={['woman', 'man', 'non-binary', 'prefer not to say']} value={d.gender} onChange={gender => update({ gender: d.gender === gender ? '' : gender })} />
  </>;
  else if (step === 'details') {
    if (q === 0) content = <>{prompt('great. who u\nhanging out with?')}<Choices options={['my person', 'someone new', 'a friend', 'my friends']} value={d.companion} onChange={companion => update({ companion })} /></>;
    else if (q === 1) content = <>{prompt('like a date or…?')}<Choices options={['a date', 'just friends', 'family']} value={d.mode === 'date' ? 'a date' : a.occasion === 'family' ? 'family' : 'just friends'} onChange={occasion => {
      update({ mode: occasion === 'a date' ? 'date' : 'hangout' }); updateAnswers({ occasion: occasion as OnboardingAnswers['occasion'] });
    }} /></>;
    else if (q === 2) content = <>{prompt('where are we heading?')}<AreaSearch area={d.area} query={a.locationQuery ?? (d.area === 'Anywhere in Sydney' ? '' : d.area)} onQuery={locationQuery => updateAnswers({ locationQuery })} onSelect={area => { update({ area }); updateAnswers({ locationQuery: area === 'Anywhere in Sydney' ? '' : area }); }} /></>;
    else if (q === 3) content = <>
      {prompt('what’s the budget?')}<Text style={onboardingStyles.label}>budget each</Text>
      <View style={styles.entry}><Text style={styles.currency}>$</Text><Input label="budget each" value={a.budgetInput ?? String(d.budget)} placeholder="e.g. 80" keyboardType="decimal-pad" maxLength={8} onFocus={() => setComplete(true)} onChangeText={budgetInput => updateAnswers({ budgetInput })} style={styles.entryInput} /><Text style={styles.unit}>AUD each</Text></View>
      <Text style={[onboardingStyles.fine, { marginVertical: 12 }]}>$0–$200 per person</Text>
      <Choices options={['free', '$40', '$80', '$120']} value={(a.budgetInput ?? String(d.budget)) === '' ? '' : Number(a.budgetInput ?? d.budget) === 0 ? 'free' : `$${Number(a.budgetInput ?? d.budget)}`} onChange={value => updateAnswers({ budgetInput: value === 'free' ? '0' : value.slice(1) })} />
      <Invitation label="a few more details" detail="day, time & getting around" onPress={onExtras} />
    </>;
    else if (q === 4) content = <>{prompt('who’s coming along?')}<Text style={onboardingStyles.label}>their name (optional)</Text><Input label="their name (optional)" placeholder="name" maxLength={60} value={d.partner} onFocus={() => setComplete(true)} onChangeText={partner => update({ partner })} /></>;
    else if (q === 5) content = <>{prompt('what day works?', 'optional · defaults to today')}<DateCalendar value={onboardingDate(d, a)} onChange={date => updateAnswers({ date })} /></>;
    else if (q === 6) content = <>{prompt('and what time?', 'optional · defaults to 11 am')}<TimePicker value={a.time ?? d.time} onChange={time => updateAnswers({ time, timeExplicit: !!time })} /></>;
    else if (q === 7) content = <>{prompt('how are we getting around?')}<Choices options={['Walking', 'Public transport', 'Driving']} value={d.transport} onChange={transport => update({ transport: transport as Preferences['transport'] })} /></>;
    else content = <>{prompt('how long have we got?')}<Choices options={[3, 4, 5, 6, 8].map(n => `${n} hours`)} value={`${d.duration} hours`} onChange={value => update({ duration: Number(value.split(' ')[0]) })} /></>;
  } else if (step === 'vibes') content = q === 0 ? <>
    {prompt(`so, it’s ${d.mode === 'date' ? 'a date' : 'a hangout'}.\nlet’s make it perfect.`, 'which one feels like ur vibe?')}
    <Ideas value={a.idea} onChange={idea => updateAnswers({ idea, ideaExplicit: true })} onExtras={onExtras} />
  </> : <>
    {prompt(q === 1 ? 'what’s ur kinda hangout?' : q === 2 ? 'anything ur craving?' : 'a little adventure?')}
    <Text style={onboardingStyles.label}>{q === 1 ? 'typa hangout' : q === 2 ? 'typa food' : 'typa activity'} <Text style={onboardingStyles.fine}>pick a few</Text></Text>
    <Choices options={q === 1 ? hangoutOptions : q === 2 ? foodOptions : activityOptions} value={d.preferences} multiple onChange={toggle} />
  </>;
  else if (step === 'food') content = <>
    {prompt(q === 1 ? 'what’s the dining vibe?' : 'what food are u feeling?')}
    <Text style={onboardingStyles.label}>pick a few <Text style={onboardingStyles.fine}>optional</Text></Text>
    <Choices options={q === 1 ? diningOptions : foodOptions} value={q === 1 ? a.diningVibes : d.preferences} multiple onChange={q === 1 ? tag => updateAnswers({ diningVibes: a.diningVibes.includes(tag) ? a.diningVibes.filter(t => t !== tag) : [...a.diningVibes, tag] }) : toggle} />
  </>;
  else content = <>
    {prompt('let’s lock it in.', 'what else do you want us to know?')}
    <Input label="anything else for ur plan?" placeholder="preferences, requests, anything else…" value={a.notes} maxLength={1200} multiline textAlignVertical="top" onFocus={() => setComplete(true)} onChangeText={notes => updateAnswers({ notes })} style={styles.notes} />
    <Text style={[onboardingStyles.fine, styles.counter]}>{a.notes.length} / 1200</Text>
  </>;
  return <View onTouchStart={() => setComplete(true)}>{content}</View>;
}
const styles = StyleSheet.create({ entry: { flexDirection: 'row', alignItems: 'center', minHeight: 50, borderWidth: 1, borderColor: colors.ink, borderRadius: 99, paddingHorizontal: 14, gap: 8 }, entryInput: { flex: 1, minWidth: 0, borderWidth: 0, paddingHorizontal: 0 }, unit: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, flexShrink: 1 }, currency: { fontFamily: fonts.medium, color: colors.ink, fontSize: 20 }, notes: { borderRadius: 20, minHeight: 160, paddingTop: 15 }, counter: { textAlign: 'right', marginTop: 8 } });
