import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTime, type ScheduledStop } from '@melloway/domain';
import { Button, Field } from './UI';
import { common, colors } from '../theme';

export default function TimeframeEditor({ stop, busy, onSave, onClose }: {
  stop: ScheduledStop; busy: boolean; onSave: (values: { mins: number; arrivalOverride?: number }) => Promise<boolean>; onClose: () => void;
}) {
  const [arrival, setArrival] = useState(`${String(Math.floor(stop.arrival % 1440 / 60)).padStart(2, '0')}:${String(stop.arrival % 60).padStart(2, '0')}`);
  const [duration, setDuration] = useState(String(stop.mins));
  const [automatic, setAutomatic] = useState(false), [nextDay, setNextDay] = useState(stop.arrival >= 1440), [error, setError] = useState('');
  async function submit() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(arrival) || !Number.isInteger(Number(duration)) || Number(duration) < 5 || Number(duration) > 480) { setError('Use HH:MM and a visit of 5–480 minutes.'); return; }
    const [hour, minute] = arrival.split(':').map(Number);
    const okay = await onSave({ mins: Number(duration), arrivalOverride: automatic ? undefined : hour * 60 + minute + (nextDay ? 1440 : 0) });
    if (okay) onClose(); else setError('This time conflicts with travel, opening hours, budget or outing duration.');
  }
  return <Modal visible animationType="none" onRequestClose={onClose} presentationStyle="pageSheet">
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 20 }}>
      <Text accessibilityRole="header" style={common.title}>{stop.name}</Text>
      <Text style={common.fine}>{formatTime(stop.arrival)} now · later stops update.</Text>
      <Button label={automatic ? 'automatic arrival ✓' : 'set arrival time'} tone="cream" onPress={() => setAutomatic(!automatic)} />
      {!automatic && <View style={{ gap: 12 }}><Field label="arrive at (HH:MM)" value={arrival} onChangeText={setArrival} keyboardType="numbers-and-punctuation" />
        <Button label={nextDay ? 'next day ✓' : 'same day'} tone="cream" onPress={() => setNextDay(!nextDay)} /></View>}
      <Field label="visit length in minutes" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
      {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
      <Button label="save timeframe" busy={busy} onPress={() => { void submit(); }} /><Button label="cancel" tone="cream" disabled={busy} onPress={onClose} />
    </ScrollView></SafeAreaView>
  </Modal>;
}
