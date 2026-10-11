import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeTikTokShareUrl, parseSocialMediaUrl, type SocialMediaUrl } from '@melloway/domain';

export class SocialLinkError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(message: string, status: number, reason = 'invalid_link') {
    super(message); this.status = status; this.reason = reason;
  }
}

const resolutionFailure = (reason: string) => new SocialLinkError(
  'TikTok could not resolve this share link. Try again or open the original link.', 502, reason,
);

/** Follow only TikTok share redirects. No page bodies, video downloads or scraping. */
export async function resolveSocialLink(input: unknown, options: {
  fetcher?: typeof fetch; timeoutMs?: number;
} = {}): Promise<SocialMediaUrl> {
  const full = parseSocialMediaUrl(input);
  if (full) return full;
  let current = normalizeTikTokShareUrl(input);
  if (!current) throw new SocialLinkError('Paste a TikTok video/share link or Instagram Reel link.', 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  const visited = new Set<string>();
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (visited.has(current)) throw resolutionFailure('redirect_loop');
      visited.add(current);
      const response = await (options.fetcher ?? fetch)(current, {
        method: 'HEAD', redirect: 'manual', signal: controller.signal,
      });
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        throw resolutionFailure(`upstream_http_${response.status}`);
      }
      if (!location) throw resolutionFailure('missing_redirect');
      // Preserve the header's spelling so URL repairs cannot hide ports or malformed paths.
      const destination = location.startsWith('/') ? new URL(current).origin + location : location;
      const video = parseSocialMediaUrl(destination);
      if (video?.platform === 'tiktok' && destination.startsWith('https://')) return video;
      // Validate every hop before contacting it; other hosts and protocols are rejected.
      const next = normalizeTikTokShareUrl(destination);
      if (!next) throw resolutionFailure('unsupported_redirect');
      current = next;
    }
    throw resolutionFailure('redirect_limit');
  } catch (error) {
    if (error instanceof SocialLinkError) throw error;
    throw resolutionFailure(controller.signal.aborted ? 'timeout' : 'network_failure');
  } finally { clearTimeout(timer); }
}

export function createSocialLinkHandler(options: Parameters<typeof resolveSocialLink>[1] = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, data: object) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 4096) return reply(413, { error: 'Link request is too large.' });
      }
      let data: unknown;
      try { data = JSON.parse(raw); }
      catch { return reply(400, { error: 'Invalid JSON.' }); }
      const url = data && typeof data === 'object' && 'url' in data ? data.url : undefined;
      reply(200, { video: await resolveSocialLink(url, options) });
    } catch (error) {
      if (error instanceof SocialLinkError && error.status >= 500) {
        console.warn(`[social-link] ${error.reason}`);
      }
      reply(error instanceof SocialLinkError ? error.status : 502, {
        error: error instanceof SocialLinkError ? error.message : 'Link service unavailable. Try again.',
      });
    }
  };
}
