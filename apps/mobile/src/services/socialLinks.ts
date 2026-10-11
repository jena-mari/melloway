import { normalizeTikTokShareUrl, parseSocialMediaUrl, type SocialMediaUrl } from '@melloway/domain';
import { resolveConfig } from './config.ts';

export async function resolveSocialLink(input: unknown, options: {
  origin?: string; signal?: AbortSignal;
} = {}): Promise<SocialMediaUrl> {
  const full = parseSocialMediaUrl(input);
  if (full) return full;
  if (typeof input === 'string' && !input.trim()) throw new Error('Paste a link first.');
  const shareUrl = normalizeTikTokShareUrl(input);
  if (!shareUrl) throw new Error('Paste a TikTok video/share link or Instagram Reel link.');
  let origin: string;
  try { origin = resolveConfig('live', options.origin ?? process.env.EXPO_PUBLIC_API_URL).apiUrl!; }
  catch { throw new Error('The link service is not connected. Please connect it and try again.'); }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(`${origin}/api/social-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: shareUrl }), signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('This server does not have the link service (HTTP 404). Restart the backend and reload the app.');
      }
      if (response.status === 429) {
        throw new Error('Too many requests to the link service (HTTP 429). Wait a minute, then try again.');
      }
      if (response.status === 502) {
        throw new Error('TikTok could not resolve this share link (HTTP 502). Try again or open the original link.');
      }
      throw new Error(`The link service could not check this link (HTTP ${response.status}). Try again.`);
    }
    const data = await response.json() as { video?: Partial<SocialMediaUrl> };
    const video = parseSocialMediaUrl(data?.video?.normalizedUrl);
    if (!video || video.platform !== 'tiktok' || data.video?.platform !== video.platform || data.video.id !== video.id) {
      throw new Error('The link service returned an invalid video link. Try again.');
    }
    return video;
  } catch (error) {
    if (error instanceof TypeError || controller.signal.aborted) {
      throw new Error('The link service could not be reached. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
