import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { validTime } from '../../services/onboarding';
import { colors, fonts } from '../../theme';
import { Choice, choiceAccessibility, onboardingStyles } from './Controls';

type Part = 'hour' | 'minute' | 'period';
const presets = [{ label: 'morning', display: '11 am', time: '11:00', icon: '☀' }, { label: 'afternoon', display: '2 pm', time: '14:00', icon: '☼' }, { label: 'evening', display: '6 pm', time: '18:00', icon: '☾' }];
export default function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const reduced = useReducedMotion();
  const [part, setPart] = useState<Part | null>(null);
  const selected = validTime(value);
  const [hours, minutes] = (selected ? value : '11:00').split(':').map(Number);
  const hour = hours % 12 || 12, period = hours >= 12 ? 'pm' : 'am';
  function change(next: string) {
    const h = part === 'hour' ? Number(next) : hour;
    const m = part === 'minute' ? Number(next) : minutes;
    const p = part === 'period' ? next : period;
    onChange(`${String(h % 12 + (p === 'pm' ? 12 : 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    setPart(null);
  }
  const options = part === 'period' ? ['am', 'pm'] : Array.from({ length: part === 'hour' ? 12 : 60 }, (_, i) => part === 'hour' ? String(i + 1) : String(i).padStart(2, '0'));
  const displays = { hour: selected ? String(hour) : 'hh', minute: selected ? String(minutes).padStart(2, '0') : 'mm', period: selected ? period : '—' };
  return <View style={styles.wrapper}>
    <View style={styles.presets}>{presets.map(p => <Pressable key={p.time} accessibilityRole="button" accessibilityLabel={`${p.label}, ${p.display}`} {...choiceAccessibility(value === p.time)} onPress={() => onChange(p.time)} style={[styles.preset, value === p.time && onboardingStyles.selected]}>
      <Text style={[styles.icon, value === p.time && onboardingStyles.selectedText]}>{p.icon}</Text>
      <Text style={[onboardingStyles.fine, value === p.time && onboardingStyles.selectedText]}>{p.label}</Text>
      <Text style={[styles.time, value === p.time && onboardingStyles.selectedText]}>{p.display}</Text>
    </Pressable>)}</View>
    <Text style={onboardingStyles.label}>or pick ur own</Text>
    <View style={styles.controls}>{(['hour', 'minute', 'period'] as const).map(p => <View key={p} style={styles.control}>
      <Text style={onboardingStyles.fine}>{p === 'period' ? 'am or pm' : p}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`choose ${p}, ${displays[p]}`} onPress={() => setPart(p)} style={styles.select}><Text style={styles.time}>{displays[p]} ⌄</Text></Pressable>
    </View>)}</View>
    <Choice label="not sure yet" selected={!selected} onPress={() => onChange('')} />
    <Text accessibilityLiveRegion="polite" style={onboardingStyles.fine}>{selected ? `starting around ${hour}:${String(minutes).padStart(2, '0')} ${period}` : 'no time picked · we’ll use 11 am'}</Text>
    <Modal visible={part !== null} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setPart(null)}>
      <SafeAreaView style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="close time choices" style={StyleSheet.absoluteFill} onPress={() => setPart(null)} />
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text accessibilityRole="header" style={styles.dialogTitle}>choose {part}</Text>
          <FlatList data={options} keyExtractor={item => item} style={styles.options} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item} {...choiceAccessibility(part !== null && displays[part] === item)} onPress={() => change(item)} style={styles.option}><Text style={styles.time}>{item}</Text></Pressable>} />
          <Choice label="cancel" selected={false} onPress={() => setPart(null)} />
        </View>
      </SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { gap: 14 }, presets: { flexDirection: 'row', gap: 9 },
  preset: { flex: 1, minHeight: 108, borderWidth: 1, borderColor: '#e4e4e4', borderRadius: 18, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  icon: { fontSize: 21, color: colors.ink }, time: { fontFamily: fonts.medium, color: colors.ink, fontSize: 17, lineHeight: 24 },
  controls: { flexDirection: 'row', gap: 12 }, control: { flex: 1, gap: 6 }, select: { minHeight: 48, borderWidth: 1, borderColor: '#e4e4e4', borderRadius: 14, padding: 11 },
  overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '75%', borderRadius: 22, backgroundColor: colors.white, padding: 20, gap: 12 },
  dialogTitle: { fontFamily: fonts.medium, color: colors.ink, fontSize: 18 }, options: { flexGrow: 0 },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e4e4e4' },
});
