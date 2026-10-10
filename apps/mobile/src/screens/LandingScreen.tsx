import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { Screen } from '../components/Screen';
import { Button, MoodImage, Notice } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { colors, common, fonts } from '../theme';

export default function LandingScreen() {
  const update = useAppStore(state => state.update);
  const start = (mode: 'date' | 'hangout') => { update({ mode }); router.push('/onboarding'); };
  return <Screen eyebrow="GOOD PLANS START HERE · SYDNEY EDITION — 01">
    <Animated.View entering={FadeInDown.duration(350).reduceMotion(ReduceMotion.System)} style={styles.hero}>
      <View style={styles.pill}><Text style={common.fine}>for dates, mates & everything in between</Text></View>
      <Text accessibilityRole="header" style={common.title}>less planning.</Text>
      <Text style={common.script}>more chemistry. ✳</Text>
      <Text style={common.text}>your kind of places. your kind of person.{"\n"}a whole day that just clicks.</Text>
    </Animated.View>
    <Text style={common.label}>what are we planning? ↴</Text>
    <Button label="a date ♡" onPress={() => start('date')} />
    <Button label="just a cute hangout ✳" tone="yellow" onPress={() => start('hangout')} />
    <Button label="paste a TikTok or Reel link" tone="green" onPress={() => router.push('/social-link')} />
    <Button label="Ticketmaster venue map" tone="yellow" onPress={() => router.push('/events-map')} />
    <View style={styles.art}>
      <MoodImage uri="https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=900&q=80" height={260} />
      <View style={styles.sticker}><Text style={styles.stickerText}>less scrolling{"\n"}♡{"\n"}more living</Text></View>
    </View>
    <Notice>Start with a demo Sydney outing. No account or paid API credentials needed. Sample venues, hours and prices help you explore the flow.</Notice>
    <View style={styles.steps}>
      <Text style={common.script}>keep the butterflies.</Text>
      {['01 · tell us ur vibe', '02 · we connect the dots', '03 · go make a memory'].map(text => <Text key={text} style={common.text}>{text}</Text>)}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  hero: { gap: 12 }, pill: { borderWidth: 1, borderColor: colors.ink, borderRadius: 99, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6 },
  art: { position: 'relative', marginTop: 10 }, sticker: { position: 'absolute', right: 8, top: -15, width: 102, height: 102, borderRadius: 51, backgroundColor: colors.yellow, borderWidth: 1, borderColor: colors.ink, justifyContent: 'center', transform: [{ rotate: '12deg' }] },
  stickerText: { fontFamily: fonts.regular, textAlign: 'center', color: colors.ink, fontSize: 13, lineHeight: 23 },
  steps: { gap: 14 },
});
