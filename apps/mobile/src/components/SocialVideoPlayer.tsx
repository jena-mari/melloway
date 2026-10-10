// Browser preview; Metro uses the native WebView implementation on phones.
export default function SocialVideoPlayer({ uri, title, onError }: {
  uri: string; title: string; onError: () => void;
}) {
  return <iframe src={uri} title={title} allow="fullscreen; encrypted-media; picture-in-picture"
    allowFullScreen onError={onError} style={{ width: '100%', height: '100%', border: 0 }} />;
}
