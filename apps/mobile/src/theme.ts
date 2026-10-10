import { StyleSheet } from 'react-native';

export const colors = {
  cream: '#FFFDF9', ink: '#24231F', pink: '#F8A8B9', yellow: '#F5E8AA',
  green: '#D3E4B4', muted: '#68645C', line: '#DAD7CF', error: '#9D263E', white: '#FFFFFF',
};
export const fonts = { regular: 'Outfit_400Regular', medium: 'Outfit_500Medium', bold: 'Outfit_600SemiBold', script: 'Yellowtail_400Regular' };
export const common = StyleSheet.create({
  text: { fontFamily: fonts.regular, color: colors.ink, fontSize: 16, lineHeight: 24 },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 44, lineHeight: 48, letterSpacing: -1.8 },
  script: { fontFamily: fonts.script, fontSize: 48, lineHeight: 54, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, color: colors.muted, fontSize: 16, lineHeight: 25 },
  eyebrow: { fontFamily: fonts.medium, color: colors.ink, fontSize: 11, letterSpacing: 1.5, lineHeight: 18 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, lineHeight: 21 },
  fine: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12, lineHeight: 19 },
  error: { fontFamily: fonts.regular, color: colors.error, fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink, borderRadius: 20, padding: 20, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
});
