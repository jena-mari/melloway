export interface SocialMediaUrl {
  platform: 'tiktok' | 'instagram';
  /** Kept as a string so large TikTok IDs retain their precision. */
  id: string;
  normalizedUrl: string;
}

/**
 * Parses standard full TikTok video and Instagram Reel URLs, without requests.
 * Accepts HTTP(S), bare/www hosts, and optional trailing slashes. Normalizes to
 * HTTPS/www and removes query parameters and fragments. Returns null for other
 * input, including shortened links. This checks URL format, not post existence.
 */
export function parseSocialMediaUrl(input: unknown): SocialMediaUrl | null {
  if (typeof input !== 'string') return null;

  const value = input.trim();
  if (/[\s\\]/u.test(value)) return null;

  // Match only the supported hosts and preserve the path exactly: no credentials,
  // ports, encoded path segments, or URL-parser repairs of malformed paths.
  const url = /^https?:\/\/((?:www\.)?(?:tiktok|instagram)\.com)(\/[^?#]*)(?:[?#].*)?$/i.exec(value);
  if (!url) return null;

  const host = url[1].toLowerCase();
  const path = url[2];

  if (host === 'tiktok.com' || host === 'www.tiktok.com') {
    const video = /^\/@([A-Za-z0-9_.]+)\/video\/([0-9]+)\/?$/.exec(path);
    if (!video) return null;
    return {
      platform: 'tiktok',
      id: video[2],
      normalizedUrl: `https://www.tiktok.com/@${video[1]}/video/${video[2]}`,
    };
  }

  const reel = /^\/reel\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (!reel) return null;
  return {
    platform: 'instagram',
    id: reel[1],
    normalizedUrl: `https://www.instagram.com/reel/${reel[1]}/`,
  };
}
