/** Private, offline import of TikTok links/captions already displayed in a browser. */
import { lstat, open } from 'node:fs/promises';
import { discoverSocialVideos, parseSocialMediaUrl, type DiscoveryCafe, type SocialSearchSource } from '@melloway/domain';

export interface BrowserCapture {
  version: 1;
  mode: 'browser-capture';
  searchUrl: string;
  capturedAt: string;
  sources: Array<{ url: string; snippet: string }>;
}

const MAX_CAPTURE_BYTES = 256_000;
const invalid = () => new Error('Invalid browser capture. Use docs/TIKTOK_BROWSER.md; no candidates saved.');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));

export function parseBrowserCapture(value: unknown): BrowserCapture {
  if (!object(value) || !keys(value, ['version', 'mode', 'searchUrl', 'capturedAt', 'sources'])
    || value.version !== 1 || value.mode !== 'browser-capture'
    || typeof value.searchUrl !== 'string' || value.searchUrl.length > 2048
    || typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))
    || new Date(value.capturedAt).toISOString() !== value.capturedAt
    || !Array.isArray(value.sources) || value.sources.length > 20) throw invalid();
  let url: URL;
  try { url = new URL(value.searchUrl); } catch { throw invalid(); }
  const query = url.searchParams.get('q');
  if (url.origin !== 'https://www.tiktok.com' || url.username || url.password || url.hash
    || !/^\/search\/?$/.test(url.pathname) || !query?.trim() || query.length > 300
    || [...url.searchParams.keys()].some(key => key !== 'q') || url.searchParams.getAll('q').length !== 1) throw invalid();
  const sources: BrowserCapture['sources'] = [];
  for (const source of value.sources) {
    if (!object(source) || !keys(source, ['url', 'snippet']) || typeof source.url !== 'string'
      || source.url.length > 512 || typeof source.snippet !== 'string' || source.snippet.length > 8192) throw invalid();
    const post = parseSocialMediaUrl(source.url);
    if (post?.platform !== 'tiktok' || post.normalizedUrl !== source.url
      || !/^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9_.]{1,100}\/video\/[0-9]{1,30}$/.test(source.url)) throw invalid();
    sources.push({ url: source.url, snippet: source.snippet });
  }
  return { version: 1, mode: 'browser-capture', searchUrl: url.href, capturedAt: value.capturedAt, sources };
}

export async function readBrowserCapture(path: string): Promise<BrowserCapture> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > MAX_CAPTURE_BYTES) throw invalid();
    file = await open(path, 'r');
    const buffer = Buffer.alloc(MAX_CAPTURE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_CAPTURE_BYTES) throw invalid();
    return parseBrowserCapture(JSON.parse(buffer.subarray(0, size).toString('utf8')));
  } catch { throw invalid(); }
  finally { await file?.close(); }
}

export async function discoverBrowserCafeVideos(cafe: DiscoveryCafe, capture: BrowserCapture) {
  const validated = parseBrowserCapture(capture);
  // This is the same pure matcher used by live providers. Its 'mock' supplier
  // contract means no network; the CLI reports actual browser captures separately.
  const sources: SocialSearchSource[] = validated.sources;
  const candidates = await discoverSocialVideos(cafe, { mode: 'mock', async search() { return sources; } });
  return { received: sources.length, candidates, searchUrl: validated.searchUrl, capturedAt: validated.capturedAt };
}
