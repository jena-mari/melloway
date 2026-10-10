import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { parseSocialMediaUrl, type SocialMediaUrl } from '@melloway/domain';
import { Screen } from '../components/Screen';
import { Button, Field } from '../components/UI';
import { colors, common } from '../theme';
import SocialVideoPreview from '../components/SocialVideoPreview';

export default function SocialLinkScreen() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<SocialMediaUrl | null>(null);
  const [error, setError] = useState('');

  const changeInput = (value: string) => {
    setInput(value);
    setResult(null);
    setError('');
  };
  const submit = () => {
    const parsed = parseSocialMediaUrl(input);
    setResult(parsed);
    setError(parsed ? '' : input.trim()
      ? 'Paste a full TikTok video or Instagram Reel link. Shortened and other links are not supported yet.'
      : 'Paste a link first.');
  };

  return <Screen eyebrow="TIKTOK & INSTAGRAM REELS">
    <Text accessibilityRole="header" style={common.title}>check a video link.</Text>
    <Text style={common.subtitle}>Paste a full TikTok or Reel link to preview it here.</Text>
    <Field label="Video link" value={input} onChangeText={changeInput}
      placeholder="https://www.instagram.com/reel/…/" keyboardType="url"
      autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={submit} />
    <Button label="Check link" onPress={submit} />
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
    <Text style={common.fine}>Location extraction is not connected yet.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  result: { ...common.card, backgroundColor: colors.green },
});
