import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { router } from 'expo-router';
import type { GenerationBundle } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Notice } from '../components/UI';
import { useGeneratePlan } from '../hooks/useGeneratePlan';
import { useAppStore } from '../store/useAppStore';
import { colors, common } from '../theme';

export default function GeneratingScreen() {
  const [prefs] = useState(() => useAppStore.getState().draft);
  const setCurrent = useAppStore(state => state.setCurrent);
  const { mutateAsync } = useGeneratePlan();
  const pending = useRef<Promise<GenerationBundle> | null>(null);
  const [stage, setStage] = useState('getting ur preferences together…');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    // Share one request across Strict Mode effect re-runs.
    pending.current ??= (async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return mutateAsync({ prefs, onStage: setStage });
    })();
    pending.current.then(bundle => {
      if (!active) return;
      if (!bundle.plan) { setError('No three-stop plan fits those hours, area and budget. Try an earlier start, longer duration, or wider area.'); return; }
      setCurrent(bundle); router.replace('/itinerary');
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Planning was interrupted. Try again.'); });
    return () => { active = false; };
  }, [mutateAsync, prefs, setCurrent]);
  return <Screen eyebrow="A LITTLE THOUGHT GOES A LONG WAY">
    <Text accessibilityRole="header" style={common.title}>connecting</Text><Text style={common.script}>the cute dots. ♡</Text>
    {!error && <ActivityIndicator size="large" color={colors.ink} />}
    <Text accessibilityLiveRegion="polite" style={error ? common.error : common.text}>{error || stage}</Text>
    <Notice>Demo hours and travel times are sample estimates. We do not check reservations, live events or future transit timetables.</Notice>
    {!!error && <Button label="tweak the details" onPress={() => router.replace('/preferences')} />}
  </Screen>;
}
