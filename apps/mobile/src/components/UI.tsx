import { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, common, fonts } from '../theme';

export function Button({ label, onPress, tone = 'pink', disabled, busy, testID }: {
  label: string; onPress: () => void; tone?: 'pink' | 'yellow' | 'green' | 'cream' | 'ink'; disabled?: boolean; busy?: boolean; testID?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
    aria-disabled={!!disabled || !!busy} aria-busy={!!busy}
    testID={testID} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: colors[tone], opacity: disabled || busy ? .5 : pressed ? .75 : 1 }]}>
    {busy && <ActivityIndicator color={tone === 'ink' ? colors.cream : colors.ink} />}
    <Text style={[styles.buttonText, tone === 'ink' && { color: colors.cream }]}>{label}</Text>
  </Pressable>;
}
export function Chips<T extends string | number>({ options, value, onChange, label }: {
  options: readonly T[]; value: T; onChange: (value: T) => void; label: string;
}) {
  return <View style={styles.group}>
    <Text style={common.label}>{label}</Text>
    <View style={common.row}>{options.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={String(option)}
      accessibilityState={{ checked: option === value }} aria-checked={option === value} onPress={() => onChange(option)}
      style={[styles.chip, option === value && styles.selected]}>
      <Text style={styles.chipText}>{option}{option === value ? ' ✓' : ''}</Text>
    </Pressable>)}</View>
  </View>;
}
export function MultiChips({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
  return <View style={styles.group}>
    <Text style={common.label}>{label}</Text>
    <View style={common.row}>{options.map(option => {
      const selected = value.includes(option);
      return <Pressable key={option} accessibilityRole="checkbox" accessibilityLabel={option} accessibilityState={{ checked: selected }} aria-checked={selected}
        onPress={() => onChange(selected ? value.filter(v => v !== option) : [...value, option])}
        style={[styles.chip, selected && styles.selected]}>
        <Text style={styles.chipText}>{option}{selected ? ' ✓' : ''}</Text>
      </Pressable>;
    })}</View>
  </View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.group}>
    <Text style={common.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} {...props} />
  </View>;
}
export function Notice({ children }: PropsWithChildren) {
  return <View style={styles.notice}><Text style={common.fine}>{children}</Text></View>;
}
export function MoodImage({ uri, height = 190, source = 'demo', attribution }: { uri?: string; height?: number; source?: 'demo' | 'google'; attribution?: string }) {
  const [failed, setFailed] = useState(false);
  return <View style={[styles.photo, { height }]}>
    {uri && !failed ? <Image source={{ uri }} resizeMode="cover" accessibilityLabel={source === 'demo' ? 'Illustrative mood photograph' : 'Google Places venue photograph'} style={StyleSheet.absoluteFill} onError={() => setFailed(true)} />
      : <Text style={styles.orb}>✳</Text>}
    <Text style={styles.caption}>{source === 'demo' ? 'illustrative mood imagery' : `Google Places${attribution ? ' · ' + attribution : ''}`}</Text>
  </View>;
}
const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 99, borderWidth: 1, borderColor: colors.ink, paddingHorizontal: 22, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink, textAlign: 'center' },
  group: { gap: 10 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.ink, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 10 },
  selected: { backgroundColor: colors.pink },
  chipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  input: { fontFamily: fonts.regular, fontSize: 16, color: colors.ink, backgroundColor: colors.cream, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.ink, paddingHorizontal: 15, paddingVertical: 12 },
  notice: { borderRadius: 14, backgroundColor: colors.yellow, padding: 16, borderWidth: 1, borderColor: colors.line },
  photo: { backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', borderRadius: 16, overflow: 'hidden' },
  orb: { fontSize: 84, color: colors.ink },
  caption: { position: 'absolute', bottom: 10, left: 10, fontFamily: fonts.regular, fontSize: 11, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, color: colors.ink, backgroundColor: colors.cream },
});
