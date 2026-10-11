import { useCallback, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { budgetIsValid, ideas, nextQuestion, onboardingSteps, planningPreferences, previousQuestion, questionError, questionTrail, readQuestion, submissionError, type Question } from '../services/onboarding';
import Questions from '../components/onboarding/Questions';
import { onboardingStyles } from '../components/onboarding/Controls';
import { colors, fonts } from '../theme';

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ step?: string; q?: string; trail?: string }>();
  const question = readQuestion(params.step, params.q);
  const trail = questionTrail(params.trail);
  const draft = useAppStore(state => state.draft);
  const answers = useAppStore(state => state.onboarding);
  const update = useAppStore(state => state.update);
  const updateAnswers = useAppStore(state => state.updateOnboarding);
  const [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null);
  const index = onboardingSteps.indexOf(question.step);
  useFocusEffect(useCallback(() => { setError(''); scroll.current?.scrollTo({ y: 0, animated: false }); }, [setError]));
  function go(next: Question) {
    Keyboard.dismiss(); setError('');
    router.push({ pathname: '/onboarding', params: { step: next.step, q: String(next.q), trail: [...trail, question].map(item => `${item.step}.${item.q}`).join(',') } });
  }
  function back() {
    Keyboard.dismiss();
    if (router.canGoBack()) { router.back(); return; }
    const previous = trail.at(-1) ?? previousQuestion(question);
    if (!previous) { router.replace('/'); return; }
    router.replace({ pathname: '/onboarding', params: { step: previous.step, q: String(previous.q), trail: trail.slice(0, -1).map(item => `${item.step}.${item.q}`).join(',') } });
  }
  function advance(skipped = false) {
    if (!skipped) {
      const invalid = questionError(question, draft, answers);
      if (invalid) { setError(invalid); return; }
    }
    if (skipped && question.step === 'details') {
      if (question.q === 2) { update({ area: 'Anywhere in Sydney' }); updateAnswers({ locationQuery: '' }); }
      if (question.q === 5) updateAnswers({ date: '' });
      if (question.q === 6) updateAnswers({ time: '', timeExplicit: false });
    }
    const next = nextQuestion(question, skipped);
    if (question.step === 'details' && next?.step !== 'details') {
      const value = answers.budgetInput ?? String(draft.budget);
      const budget = budgetIsValid(value) ? Number(value) : 80;
      update({ budget }); updateAnswers({ budgetInput: String(budget) });
    }
    if (question.step === 'vibes' && next?.step !== 'vibes') updateAnswers({ idea: skipped ? '' : answers.idea || ideas[0].id, ideaExplicit: skipped ? false : answers.ideaExplicit });
    if (next) go(next);
    else {
      const state = useAppStore.getState();
      const invalid = submissionError(state.draft, state.onboarding);
      if (invalid) { setError(invalid); return; }
      update(planningPreferences(state.draft, state.onboarding));
      Keyboard.dismiss(); router.replace('/generating');
    }
  }
  function extras() {
    const invalid = questionError(question, draft, answers);
    if (invalid) { setError(invalid); return; }
    go({ step: question.step, q: question.step === 'details' ? 4 : 1 });
  }
  const beat = question.step === 'about' || question.step === 'food' ? `${question.q + 1} of 2`
    : question.step === 'details' ? question.q < 4 ? `${question.q + 1} of 4` : `${question.q - 3} of 5`
      : question.step === 'vibes' && question.q > 0 ? `${question.q === 1 ? 1 : 2} of 2` : '';
  return <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="back" onPress={back} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Planning progress" aria-valuemin={1} aria-valuemax={onboardingSteps.length} aria-valuenow={index + 1} accessibilityValue={{ min: 1, max: onboardingSteps.length, now: index + 1 }} style={styles.progress}>{onboardingSteps.map((step, i) => <View key={step} style={[styles.dot, i <= index && styles.activeDot]} />)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="lemme skip this +" onPress={() => advance(true)} style={styles.skip}><Text style={styles.skipText}>lemme skip this +</Text></Pressable>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.form}>
          <Questions key={`${question.step}-${question.q}`} question={question} draft={draft} answers={answers} update={update} updateAnswers={updateAnswers} onExtras={extras} />
          {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            {!!beat && <Text style={onboardingStyles.fine}>{beat}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel={question.step === 'notes' ? 'submit' : 'continue'} onPress={() => advance()} style={({ pressed }) => [styles.continue, pressed && { opacity: .75 }]}><Text style={styles.continueText}>{question.step === 'notes' ? 'submit' : 'continue'}</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white }, top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  back: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 21, color: colors.ink },
  progress: { flex: 1, minWidth: 55, flexDirection: 'row', gap: 5 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#24231f20' }, activeDot: { backgroundColor: colors.ink },
  skip: { minHeight: 44, maxWidth: '52%', flexShrink: 1, justifyContent: 'center', paddingHorizontal: 4 }, skipText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 10 },
  content: { paddingHorizontal: 30, paddingTop: 64, paddingBottom: 70, flexGrow: 1 }, form: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  actions: { gap: 10, marginTop: 24, alignItems: 'flex-start' }, continue: { minHeight: 48, minWidth: 90, justifyContent: 'center', alignItems: 'center', borderRadius: 99, backgroundColor: colors.ink, paddingVertical: 12, paddingHorizontal: 24 }, continueText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.white },
  error: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: colors.error, marginTop: 16 },
});
