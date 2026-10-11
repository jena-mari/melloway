import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSocialMediaUrl, type SavedTikTokPlace, type TikTokPlaceSuggestion } from '@melloway/domain';
import { discoverSydneyTikTokPlaces, type DiscoveryUsage } from './socialDiscovery.ts';
import { matchTikTokPlace, validPlaceId } from './tiktokPlaceMatching.ts';

export const defaultCataloguePath = fileURLToPath(new URL('../.local/discovery/tiktok-places.json', import.meta.url));
interface UnmatchedPlace { candidate: TikTokPlaceSuggestion; reason: 'no_clear_match' | 'ambiguous' | 'lookup_failed' | 'duplicate_place' }
interface PopulationRun {
  query: string;
  model: string;
  status: 'started' | 'completed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  usage: DiscoveryUsage | null;
  found: number | null;
  unmatched: UnmatchedPlace[];
}
const retryable = (run: PopulationRun) => run.status === 'failed'
  || (run.status === 'completed' && (run.found === run.unmatched.length
    || run.unmatched.some(entry => entry.reason === 'lookup_failed')));
export interface TikTokCatalogue { version: 1; places: SavedTikTokPlace[]; runs: PopulationRun[] }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const time = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const queryKey = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
const invalid = () => new Error('Invalid TikTok place catalogue. Existing discovery data was not reset.');
const suggestionKeys = ['name', 'suburb', 'sourceUrl', 'normalizedUrl', 'postId', 'evidence'];
function validSuggestion(value: unknown): value is TikTokPlaceSuggestion {
  if (!object(value) || suggestionKeys.some(key => !text(value[key]))) return false;
  const source = parseSocialMediaUrl(value.sourceUrl);
  const post = parseSocialMediaUrl(value.normalizedUrl);
  return source?.platform === 'tiktok' && post?.platform === 'tiktok' && source.normalizedUrl === post.normalizedUrl
    && post.normalizedUrl === value.normalizedUrl && post.id === value.postId;
}
function validate(value: unknown): TikTokCatalogue {
  if (!object(value) || !exact(value, ['version', 'places', 'runs']) || value.version !== 1
    || !Array.isArray(value.places) || !Array.isArray(value.runs)) throw invalid();
  const places = new Set<string>();
  const posts = new Set<string>();
  for (const place of value.places) {
    if (!object(place) || !exact(place, [...suggestionKeys, 'placeId', 'discoveredAt', 'reviewStatus'])
      || !validSuggestion(place) || !validPlaceId(place.placeId) || !time(place.discoveredAt) || place.reviewStatus !== 'pending'
      || places.has(place.placeId) || posts.has(place.postId)) throw invalid();
    places.add(place.placeId); posts.add(place.postId);
  }
  const queries = new Map<string, PopulationRun>();
  for (const run of value.runs) {
    if (!object(run) || !exact(run, ['query', 'model', 'status', 'startedAt', 'finishedAt', 'usage', 'found', 'unmatched'])
      || !text(run.query) || !text(run.model) || !time(run.startedAt) || typeof run.status !== 'string'
      || !['started', 'completed', 'failed'].includes(run.status)
      || (run.status === 'started' ? run.finishedAt !== null : !time(run.finishedAt))
      || (run.found !== null && (!Number.isInteger(run.found) || Number(run.found) < 0 || Number(run.found) > 5))
      || !Array.isArray(run.unmatched) || run.unmatched.length > 5) throw invalid();
    if (run.usage !== null && (!object(run.usage) || !exact(run.usage, ['inputTokens', 'outputTokens', 'cachedInputTokens', 'webSearchCalls'])
      || Object.values(run.usage).some(count => !Number.isInteger(count) || Number(count) < 0)
      || Number(run.usage.cachedInputTokens) > Number(run.usage.inputTokens) || Number(run.usage.webSearchCalls) > 2)) throw invalid();
    for (const entry of run.unmatched) {
      if (!object(entry) || !exact(entry, ['candidate', 'reason']) || !object(entry.candidate)
        || !exact(entry.candidate, suggestionKeys) || !validSuggestion(entry.candidate) || typeof entry.reason !== 'string'
        || !['no_clear_match', 'ambiguous', 'lookup_failed', 'duplicate_place'].includes(entry.reason)) throw invalid();
    }
    const previous = queries.get(queryKey(run.query));
    if (previous && !retryable(previous)) throw invalid();
    queries.set(queryKey(run.query), run as unknown as PopulationRun);
  }
  return value as unknown as TikTokCatalogue;
}

export async function readTikTokCatalogue(filePath = defaultCataloguePath): Promise<TikTokCatalogue> {
  try {
    if (!(await lstat(filePath)).isFile()) throw invalid();
    return validate(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (object(error) && error.code === 'ENOENT') return { version: 1, places: [], runs: [] };
    throw invalid();
  }
}
async function save(path: string, data: TikTokCatalogue) {
  validate(data);
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await handle.sync(); await handle.close(); handle = undefined;
    await rename(temporary, path);
  } catch { throw new Error('Could not save TikTok discoveries. Stop before another paid lookup.'); }
  finally { await handle?.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

/** Explicit CLI work only. Browsing the map never calls OpenAI or reruns discovery. */
export async function populateTikTokPlaces(query = 'Sydney cafés and brunch spots',
  options: { fetcher?: typeof fetch; now?: () => Date; filePath?: string; retry?: boolean } = {}) {
  const path = resolve(options.filePath ?? defaultCataloguePath);
  const model = process.env.OPENAI_DISCOVERY_MODEL?.trim();
  if (!query.trim() || query.length > 200) throw new Error('Supply a short Sydney discovery query.');
  if (options.retry !== undefined && typeof options.retry !== 'boolean') throw new Error('Retry must be an explicit boolean.');
  if (!model) throw new Error('Set OPENAI_DISCOVERY_MODEL on the server.');
  // Validate storage and all credentials before spending an OpenAI call.
  await readTikTokCatalogue(path);
  if (!process.env.OPENAI_API_KEY?.trim() || !process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new Error('Configure OPENAI_API_KEY and GOOGLE_MAPS_API_KEY (Places API New) in .env before population. No paid lookup was made.');
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new Error('TikTok population is busy or cannot be locked. No paid lookup was made.'); }
  const now = options.now ?? (() => new Date());
  try {
    const data = await readTikTokCatalogue(path);
    const previous = data.runs.filter(run => queryKey(run.query) === queryKey(query)).at(-1);
    if (previous && (!options.retry || !retryable(previous))) {
      return { skipped: true, reason: options.retry ? 'retry_not_needed' : 'already_attempted', run: previous, total: data.places.length };
    }
    const run: PopulationRun = { query: query.trim(), model, status: 'started', startedAt: now().toISOString(),
      finishedAt: null, found: null, usage: null, unmatched: [] };
    data.runs.push(run);
    await save(path, data);
    const before = data.places.length;
    try {
      const excluded = [...data.places, ...data.runs
        .filter(entry => !options.retry || queryKey(entry.query) !== queryKey(query))
        .flatMap(entry => entry.unmatched.map(item => item.candidate))];
      const result = await discoverSydneyTikTokPlaces(query, excluded, { fetcher: options.fetcher });
      run.usage = result.usage; run.found = result.candidates.length;
      for (const candidate of result.candidates) {
        try {
          const match = await matchTikTokPlace(candidate, options.fetcher);
          if (match.status === 'unmatched') run.unmatched.push({ candidate, reason: match.reason });
          else if (data.places.some(place => place.placeId === match.place.placeId || place.postId === candidate.postId)) {
            run.unmatched.push({ candidate, reason: 'duplicate_place' });
          } else data.places.push({ ...candidate, placeId: match.place.placeId, discoveredAt: now().toISOString(), reviewStatus: 'pending' });
        } catch { run.unmatched.push({ candidate, reason: 'lookup_failed' }); }
        // Retain partial progress without storing Google addresses/coordinates or provider errors.
        await save(path, data);
      }
      run.status = 'completed'; run.finishedAt = now().toISOString();
      await save(path, data);
      return { skipped: false, added: data.places.length - before, total: data.places.length, run };
    } catch (error) {
      run.status = 'failed'; run.finishedAt = now().toISOString();
      await save(path, data);
      throw error;
    }
  } finally { await lock.close(); await unlink(lockPath); }
}
