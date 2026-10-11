import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { SocialMediaUrl } from '@melloway/domain';
import { colors, common } from '../theme';
import { Button } from './UI';
import SocialVideoPlayer from './SocialVideoPlayer';

export default function SocialVideoPreview({ video }: { video: SocialMediaUrl }) {
  const [failed, setFailed] = useState(false);
  const [openError, setOpenError] = useState(false);
  const platform = video.platform === 'tiktok' ? 'TikTok' : 'Instagram';
  const id = encodeURIComponent(video.id);
  const uri = video.platform === 'tiktok'
    ? `https://www.tiktok.com/player/v1/${id}?autoplay=0&controls=1`
    : `https://www.instagram.com/reel/${id}/embed/`;

  const openOriginal = async () => {
    setOpenError(false);
    try { await Linking.openURL(video.normalizedUrl); }
    catch { setOpenError(true); }
  };

  return <View testID="social-video-preview" style={styles.container}>
    <Text accessibilityRole="header" style={common.label}>Video preview</Text>
    {failed
      ? <Text accessibilityRole="alert" style={common.error}>The preview could not load. Try opening the original link.</Text>
      : <View style={styles.player}>
        <SocialVideoPlayer uri={uri} title={`${platform} video preview`} onError={() => setFailed(true)} />
      </View>}
    <Text style={common.fine}>Private, removed or restricted videos may be unavailable. {platform} controls playback and may ask you to open its app.</Text>
    <Button label={`Open in ${platform}`} tone="green" onPress={openOriginal} />
    {openError && <Text accessibilityRole="alert" style={common.error}>Could not open the link. You can copy the cleaned URL below.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  player: { width: '100%', maxWidth: 400, height: 600, alignSelf: 'center', borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
});
