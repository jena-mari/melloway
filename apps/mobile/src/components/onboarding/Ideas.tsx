import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { ideas } from '../../services/onboarding';
import { colors, fonts } from '../../theme';
import DateIllustration from './DateIllustration';
import { Invitation, choiceAccessibility } from './Controls';

export default function Ideas({ value, onChange, onExtras }: { value: string; onChange: (id: string) => void; onExtras: () => void }) {
  const index = Math.max(0, ideas.findIndex(idea => idea.id === value));
  const idea = ideas[index];
  const gestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 35) onChange(ideas[(index + (gesture.dx < 0 ? 1 : -1) + ideas.length) % ideas.length].id);
    },
  }), [index, onChange]);
  const move = (direction: number) => onChange(ideas[(index + direction + ideas.length) % ideas.length].id);
  return <View>
    <View style={styles.carousel} accessibilityLabel="Suggested date ideas">
      <Pressable accessibilityRole="button" accessibilityLabel="Previous idea" onPress={() => move(-1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
      <View {...gestures.panHandlers} style={styles.art}><DateIllustration kind={idea.drawing} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next idea" onPress={() => move(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.caption}>{idea.title}</Text>
    <View style={styles.dots}>{ideas.map((item, i) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} {...choiceAccessibility(i === index)} onPress={() => onChange(item.id)} style={styles.dotTarget}><View style={[styles.dot, i === index && { backgroundColor: colors.ink }]} /></Pressable>)}</View>
    <Invitation label="make it more ur vibe" detail="places & little adventures" onPress={onExtras} />
  </View>;
}
const styles = StyleSheet.create({ carousel: { flexDirection: 'row', alignItems: 'center' }, arrow: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, arrowText: { fontSize: 28, color: colors.ink }, art: { flex: 1 }, caption: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14, lineHeight: 22, textAlign: 'center' }, dots: { flexDirection: 'row', justifyContent: 'center' }, dotTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#24231f30' } });
