/** Server/local CLI adapter only. Never import into the frontend. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverSocialVideos, parseSocialMediaUrl, type DiscoveryCafe,
  type MockSocialSearchProvider, type SocialSearchSource } from '@melloway/domain';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = fileURLToPath(new URL('../scripts/tiktokapi_search.py', import.meta.url));
const python = fileURLToPath(new URL('../.local/discovery/tiktokapi-venv/bin/python', import.meta.url));
const browserPath = fileURLToPath(new URL('../.local/discovery/playwright', import.meta.url));
const emptyMock: MockSocialSearchProvider = { mode: 'mock', async search() { return []; } };
const failure = () => new Error('TikTokApi search failed or was blocked. No candidates saved. See docs/TIKTOKAPI.md.');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export type TikTokCollector = (query: string, signal: AbortSignal) => Promise<unknown>;

/** Separate process; only its JSON protocol is retained, never stderr or cookies. */
export const runTikTokCollector: TikTokCollector = (query, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new Error('TikTokApi search timed out. No candidates saved.')); return; }
  const child = spawn(process.env.TIKTOK_PYTHON || python, [script], {
    cwd: root, shell: false, detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'ignore'],
    // Private OpenAI, Google and Ticketmaster credentials are not passed through.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      PYTHONDONTWRITEBYTECODE: '1', PLAYWRIGHT_BROWSERS_PATH: browserPath,
      TIKTOK_MS_TOKEN: process.env.TIKTOK_MS_TOKEN || '' },
  });
  let output = '';
  let finished = false;
  const stop = () => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch { /* Process may already have exited. */ }
  };
  const finish = (value?: unknown, error?: Error) => {
    if (finished) return;
    finished = true;
    signal.removeEventListener('abort', abort);
    if (error) { stop(); reject(error); } else resolve(value);
  };
  const abort = () => finish(undefined, new Error('TikTokApi search timed out. No candidates saved.'));
  signal.addEventListener('abort', abort, { once: true });
  child.on('error', () => finish({ version: 1, status: 'error', code: 'SETUP_REQUIRED' }));
  child.stdin.on('error', () => {}); // Early setup failure may close stdin.
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
    if (Buffer.byteLength(output) > 512_000) finish(undefined, failure());
  });
  child.on('close', code => {
    if (finished) return;
    try {
      const payload: unknown = JSON.parse(output);
      if (code !== 0 && (!object(payload) || payload.status !== 'error')) throw failure();
      finish(payload);
    } catch { finish(undefined, failure()); }
  });
  child.stdin.end(JSON.stringify({ query }));
});

function sourcesFrom(payload: unknown, query: string): SocialSearchSource[] {
  if (!object(payload) || payload.version !== 1) throw failure();
  if (payload.status === 'error') {
    if (payload.code === 'SETUP_REQUIRED') throw new Error('Install TikTokApi first. Follow docs/TIKTOKAPI.md setup.');
    if (payload.code === 'SESSION_FAILED') throw new Error('TikTokApi browser/session failed. Check setup or supply your own TIKTOK_MS_TOKEN locally; see docs/TIKTOKAPI.md. No candidates saved.');
    if (payload.code === 'TIMEOUT') throw new Error('TikTokApi search timed out. No candidates saved.');
    throw failure();
  }
  if (payload.status !== 'ok' || payload.query !== query || !Array.isArray(payload.videos)
    || payload.videos.length > 10) throw failure();
  const sources: SocialSearchSource[] = [];
  for (const video of payload.videos) {
    if (!object(video) || typeof video.url !== 'string' || typeof video.postId !== 'string'
      || typeof video.description !== 'string' || video.description.length > 8192) throw failure();
    const post = parseSocialMediaUrl(video.url);
    if (post?.platform !== 'tiktok' || post.id !== video.postId) throw failure();
    // Evidence comes from the returned caption, never from the query or input café.
    sources.push({ url: video.url, snippet: video.description });
  }
  return sources;
}

export async function discoverTikTokCafeVideos(cafe: DiscoveryCafe, options: {
  mode?: 'mock' | 'live'; mockProvider?: MockSocialSearchProvider;
  collector?: TikTokCollector; now?: () => Date; timeoutMs?: number;
} = {}) {
  if ((options.mode ?? 'mock') === 'mock') {
    const candidates = await discoverSocialVideos(cafe, options.mockProvider ?? emptyMock, options.now);
    return { received: candidates.length, candidates };
  }
  if (options.mode !== 'live') throw new Error('TikTok discovery requires explicitly live mode.');
  if (!cafe || [cafe.venueId, cafe.name, cafe.suburb].some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Supply a café venue ID, exact name and Sydney suburb.');
  }
  const venue = { venueId: cafe.venueId.trim(), name: cafe.name.trim(), suburb: cafe.suburb.trim() };
  const query = `${venue.name} ${venue.suburb} Sydney`;
  if (query.length > 300) throw new Error('TikTok search query must be at most 300 characters.');
  const timeoutMs = options.timeoutMs ?? 45_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) throw new Error('TikTok timeout must be between 1 and 45000 ms.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('TikTokApi search timed out. No candidates saved.'));
      controller.abort();
    }, timeoutMs);
  });
  let payload: unknown;
  try {
    const operation = (options.collector ?? runTikTokCollector)(query, controller.signal);
    payload = await Promise.race([operation.catch(() => { throw failure(); }), timeout]);
  } finally { clearTimeout(timer!); controller.abort(); }
  const sources = sourcesFrom(payload, query);
  const candidates = await discoverSocialVideos(venue, { mode: 'mock', async search() { return sources; } }, options.now);
  return { received: sources.length, candidates };
}
