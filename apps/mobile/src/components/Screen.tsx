import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, common, fonts } from '../theme';

export function Screen({ children, eyebrow, bottomActions }: PropsWithChildren<{ eyebrow?: string; bottomActions?: ReactNode }>) {
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {eyebrow && <Text style={common.eyebrow}>{eyebrow}</Text>}
        {children}
        <View style={styles.footer}><Text style={styles.wordmark}>melloway ♡</Text><Text style={common.fine}>Sydney, with love.</Text></View>
      </ScrollView>
      {bottomActions && <View style={styles.actions}>{bottomActions}</View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  actions: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, gap: 8 },
  content: { padding: 24, gap: 24, width: '100%', maxWidth: 680, alignSelf: 'center', flexGrow: 1 },
  footer: { marginTop: 20, paddingTop: 22, borderTopWidth: 1, borderColor: colors.line, gap: 8 },
  wordmark: { fontFamily: fonts.script, color: colors.ink, fontSize: 30 },
});
