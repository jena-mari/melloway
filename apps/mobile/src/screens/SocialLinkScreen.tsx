import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { venues, type SocialMediaUrl } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Field, Notice } from '../components/UI';
import { colors, common } from '../theme';
import SocialVideoPreview from '../components/SocialVideoPreview';
import { useVenueVideoStore } from '../store/useVenueVideoStore';
import { resolveSocialLink } from '../services/socialLinks';

export default function SocialLinkScreen() {
  return <Screen eyebrow="TIKTOK & INSTAGRAM REELS"><SocialLinkForm /></Screen>;
}

// Shared by the standalone link screen and the inline Add video flow on a venue.
export function SocialLinkForm({ venueId, onSaved, onCancel }: {
  venueId?: string; onSaved?: () => void; onCancel?: () => void;
}) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<SocialMediaUrl | null>(null);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  const add = useVenueVideoStore(state => state.add);
  const hydrated = useVenueVideoStore(state => state.hydrated);
  const selectedVenue = venues.find(venue => venue.id === venueId);

  const changeInput = (value: string) => {
    request.current?.abort();
    request.current = null;
    setChecking(false);
    setInput(value);
    setResult(null);
    setError('');
    setConfirmed(false);
  };
  const submit = async () => {
    if (saving || checking) return;
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setResult(null);
    setConfirmed(false);
    setError('');
    try {
      const video = await resolveSocialLink(input, { signal: controller.signal });
      if (request.current === controller) setResult(video);
    } catch (reason) {
      if (request.current === controller) setError(reason instanceof Error ? reason.message : 'Could not check this link.');
    } finally {
      if (request.current === controller) { request.current = null; setChecking(false); }
    }
  };
  const save = async () => {
    if (!venueId || !result || saving) return;
    setSaving(true);
    setError('');
    try { await add(venueId, result.normalizedUrl, confirmed); onSaved?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this video.'); }
    finally { setSaving(false); }
  };

  return <>
    <Text accessibilityRole="header" style={venueId ? common.label : common.title}>{venueId ? `Add a video to ${selectedVenue?.name ?? 'this venue'}` : 'check a video link.'}</Text>
    <Text style={common.subtitle}>Copy a TikTok video or photo link, or an Instagram Reel link, then paste it here to preview it.</Text>
    <Field label="Video link" value={input} onChangeText={changeInput} editable={!saving}
      placeholder="https://www.instagram.com/reel/…/" keyboardType="url"
      autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => { void submit(); }} />
    <Button label="Check link" onPress={() => { void submit(); }} disabled={saving} busy={checking} />
    {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={common.error}>{error}</Text>}
    {result && <SocialVideoPreview key={result.normalizedUrl} video={result} />}
    {result && <View testID="social-link-result" accessibilityLiveRegion="polite" style={styles.result}>
      <Text accessibilityRole="header" style={common.label}>Link format looks good</Text>
      <Text style={common.label}>Platform</Text>
      <Text selectable style={common.text}>{result.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</Text>
      <Text style={common.label}>Video / post ID</Text>
      <Text selectable style={common.text}>{result.id}</Text>
      <Text style={common.label}>Cleaned URL</Text>
      <Text selectable style={common.text}>{result.normalizedUrl}</Text>
    </View>}
    {venueId && result && <>
      <Notice>You are confirming the place yourself. The link parser does not verify where a video was filmed.</Notice>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Confirm this video features this place"
        accessibilityState={{ checked: confirmed, disabled: saving }} aria-checked={confirmed}
        disabled={saving} onPress={() => setConfirmed(value => !value)} style={common.card}>
        <Text style={common.text}>{confirmed ? '☑' : '☐'} Confirm this video features this place</Text>
      </Pressable>
      <Button label="Save video to this venue" onPress={() => { void save(); }}
        disabled={!confirmed || !hydrated} busy={saving} />
    </>}
    {venueId && <Button label="Cancel adding video" tone="cream" disabled={saving} onPress={() => onCancel?.()} />}
    {!venueId && <Text style={common.fine}>Location extraction is not connected yet.</Text>}
  </>;
}

const styles = StyleSheet.create({
  result: { ...common.card, backgroundColor: colors.green },
});
