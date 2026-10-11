export interface SocialMediaUrl {
  platform: 'tiktok' | 'instagram';
  /** Kept as a string so large TikTok IDs retain their precision. */
  id: string;
  normalizedUrl: string;
}

/** Recognizes copied TikTok share URLs; the video ID requires a redirect lookup. */
export function normalizeTikTokShareUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (/[\s\\]/u.test(value)) return null;
  const match = /^https:\/\/(vm\.tiktok\.com|vt\.tiktok\.com|(?:www\.)?tiktok\.com)(\/[^?#]*)(?:[?#].*)?$/i.exec(value);
  if (!match) return null;
  const host = match[1].toLowerCase();
  const path = host === 'vm.tiktok.com' || host === 'vt.tiktok.com'
    ? /^\/([A-Za-z0-9_-]{1,128})\/?$/.exec(match[2])
    : /^\/t\/([A-Za-z0-9_-]{1,128})\/?$/.exec(match[2]);
  if (!path) return null;
  return `https://${host}/${host.startsWith('v') ? '' : 't/'}${path[1]}/`;
}

/**
 * Parses standard full TikTok video/photo posts and Instagram Reel URLs, without requests.
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
    const post = /^\/@([A-Za-z0-9_.]+)\/(video|photo)\/([0-9]+)\/?$/.exec(path);
    if (!post) return null;
    return {
      platform: 'tiktok',
      id: post[3],
      normalizedUrl: `https://www.tiktok.com/@${post[1]}/${post[2]}/${post[3]}`,
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
