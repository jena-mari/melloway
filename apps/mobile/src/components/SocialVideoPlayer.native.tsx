import { WebView } from 'react-native-webview';

export default function SocialVideoPlayer({ uri, title, onError }: {
  uri: string; title: string; onError: () => void;
}) {
  return <WebView source={{ uri }} accessibilityLabel={title} style={{ flex: 1 }}
    allowsInlineMediaPlayback allowsFullscreenVideo mediaPlaybackRequiresUserAction
    onError={onError} onHttpError={onError} />;
}
