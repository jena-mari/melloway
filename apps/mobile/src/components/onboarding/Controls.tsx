import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { colors, fonts } from '../../theme';

export const onboardingStyles = StyleSheet.create({
  heading: { fontFamily: fonts.onboarding, color: colors.ink, fontSize: 38, lineHeight: 45, marginBottom: 15 },
  copy: { fontFamily: fonts.regular, color: colors.ink, fontSize: 13, lineHeight: 22, marginBottom: 22 },
  fine: { fontFamily: fonts.regular, color: colors.muted, fontSize: 11, lineHeight: 18 },
  label: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, lineHeight: 20, marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.ink, borderRadius: 99, paddingVertical: 11, paddingHorizontal: 16, fontFamily: fonts.regular, color: colors.ink, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { minHeight: 44, minWidth: 44, borderRadius: 99, borderWidth: 1, borderColor: colors.ink, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' },
  selected: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.regular, color: colors.ink, fontSize: 13, lineHeight: 20 },
  selectedText: { color: colors.white },
  invitation: { minHeight: 52, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 23 },
  invitationText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, textDecorationLine: 'underline', lineHeight: 20 },
});

export function Prompt({ title, copy, complete = true }: { title: string; copy?: string; complete?: boolean }) {
  const reduced = useReducedMotion();
  const whole = `${title}${copy ? `\n${copy}` : ''}`;
  const [typedCount, setCount] = useState(0);
  const count = complete || reduced ? whole.length : typedCount;
  useEffect(() => {
    if (complete || reduced) return;
    const timer = setInterval(() => setCount(n => {
      if (n >= whole.length) clearInterval(timer);
      return Math.min(n + 1, whole.length);
    }), 25);
    return () => clearInterval(timer);
  }, [complete, reduced, whole]);
  return <View>
    <View><Text aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[onboardingStyles.heading, { opacity: 0 }]}>{title}</Text>
      <Text accessibilityRole="header" accessibilityLabel={title} style={[onboardingStyles.heading, styles.ink]}>{whole.slice(0, count).slice(0, title.length)}</Text></View>
    {!!copy && <View><Text aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[onboardingStyles.copy, { opacity: 0 }]}>{copy}</Text>
      <Text accessibilityLabel={copy} style={[onboardingStyles.copy, styles.ink]}>{whole.slice(title.length + 1, count)}</Text></View>}
  </View>;
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[onboardingStyles.input, props.style]} />;
}
// Native exposes selected state; the web implementation uses toggle-button semantics.
export const choiceAccessibility = (selected: boolean) => ({ accessibilityState: { selected }, ...(Platform.OS === 'web' ? { 'aria-pressed': selected } : {}) });
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} {...choiceAccessibility(selected)} onPress={onPress}
    style={({ pressed }) => [onboardingStyles.chip, selected && onboardingStyles.selected, pressed && { opacity: .7 }]}>
    <Text style={[onboardingStyles.chipText, selected && onboardingStyles.selectedText]}>{label}</Text>
  </Pressable>;
}
export function Choices({ options, value, onChange, multiple = false }: { options: string[]; value: string | string[]; onChange: (value: string) => void; multiple?: boolean }) {
  return <View style={onboardingStyles.chips}>{options.map(option => {
    const selected = multiple ? Array.isArray(value) && value.includes(option) : value === option;
    return <Choice key={option} label={option} selected={selected} onPress={() => onChange(option)} />;
  })}</View>;
}
export function Invitation({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${detail}`} onPress={onPress} style={onboardingStyles.invitation}>
    <Text style={onboardingStyles.invitationText}>{label}</Text><Text style={onboardingStyles.fine}>{detail}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({ ink: { position: 'absolute', top: 0, left: 0, right: 0 } });
