import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { Yellowtail_400Regular } from '@expo-google-fonts/yellowtail';
import { useAppStore } from '../store/useAppStore';
import { colors, common, fonts } from '../theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60000 } } });
export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Yellowtail_400Regular, MapleShore: require('../../assets/fonts/MapleShore.otf') });
  const hydrated = useAppStore(state => state.hydrated);
  const status = useAppStore(state => state.status);
  const pathname = usePathname();
  const hasItinerary = useAppStore(state => !!state.current?.plan);
  const setStatus = useAppStore(state => state.setStatus);
  useEffect(() => { if (fontError) setStatus('Custom fonts unavailable. Using system fonts.'); }, [fontError, setStatus]);
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><QueryClientProvider client={queryClient}>
    <StatusBar style="dark" />
    {!hydrated || (!loaded && !fontError) ? <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={common.text}>a little magic, loading…</Text></View>
      : <Stack screenOptions={{ headerStyle: { backgroundColor: colors.cream }, headerTintColor: colors.ink, headerTitleStyle: { fontFamily: fonts.script, fontSize: 30 }, headerTitle: 'melloway', contentStyle: { backgroundColor: colors.cream },
        headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Saved plans" onPress={() => router.push('/saved')} style={styles.saved}><Text style={common.label}>saved ♡</Text></Pressable> }}>
        <Stack.Screen name="index" options={{ headerBackVisible: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }} />
        <Stack.Screen name="preferences" />
        <Stack.Screen name="generating" options={{ headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="itinerary" />
        <Stack.Screen name="venue/[id]" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="social-link" />
        <Stack.Screen name="tiktok-places" />
        <Stack.Screen name="events-map" />
        <Stack.Screen name="+not-found" />
      </Stack>}
    {!!status && !(pathname === '/itinerary' && hasItinerary) && <View accessibilityLiveRegion="polite" style={styles.toast}><Text style={styles.toastText}>{status}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setStatus('')} style={styles.saved}><Text style={styles.toastText}>×</Text></Pressable></View>}
  </QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, loading: { flex: 1, backgroundColor: colors.cream, justifyContent: 'center', alignItems: 'center', gap: 20 },
  saved: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  toast: { position: 'absolute', bottom: 30, left: 16, right: 16, padding: 14, borderRadius: 16, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toastText: { fontFamily: fonts.regular, color: colors.cream, fontSize: 14, lineHeight: 21, flexShrink: 1 },
});
