/** Private local history prevents repeated paid discovery, including empty/failed attempts. */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { DiscoveryCafe } from '@melloway/domain';

export interface LookupRecord {
  id: string;
  cafe: DiscoveryCafe;
  model: string;
  status: 'started' | 'completed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  candidateCount: number | null;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const identity = (cafe: DiscoveryCafe) => JSON.stringify([normalized(cafe.name), normalized(cafe.suburb)]);
const invalid = () => new Error('Invalid lookup history. Existing history was not reset.');
const isoTime = (value: unknown): value is string => typeof value === 'string'
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validateCafe(cafe: unknown): DiscoveryCafe {
  if (!object(cafe) || !exactKeys(cafe, ['venueId', 'name', 'suburb'])
    || !text(cafe.venueId) || !text(cafe.name) || !text(cafe.suburb)) {
    throw new Error('Each café needs only a venueId, exact name and Sydney suburb.');
  }
  return { venueId: cafe.venueId.trim(), name: cafe.name.trim(), suburb: cafe.suburb.trim() };
}

function validateRecords(value: unknown): LookupRecord[] {
  if (!Array.isArray(value)) throw invalid();
  const ids = new Set<string>();
  const venues = new Set<string>();
  const queries = new Set<string>();
  for (const record of value) {
    if (!object(record) || !exactKeys(record, ['id', 'cafe', 'model', 'status', 'startedAt', 'finishedAt', 'candidateCount'])
      || !text(record.id) || ids.has(record.id) || !text(record.model) || !isoTime(record.startedAt)
      || typeof record.status !== 'string' || !['started', 'completed', 'failed'].includes(record.status)) throw invalid();
    let cafe: DiscoveryCafe;
    try { cafe = validateCafe(record.cafe); } catch { throw invalid(); }
    const storedCafe = record.cafe;
    if (!object(storedCafe) || Object.entries(cafe).some(([key, entry]) => storedCafe[key] !== entry)
      || venues.has(cafe.venueId) || queries.has(identity(cafe))) throw invalid();
    if (record.status === 'started' ? record.finishedAt !== null : !isoTime(record.finishedAt)) throw invalid();
    if (record.status === 'completed'
      ? !Number.isInteger(record.candidateCount) || Number(record.candidateCount) < 0 || Number(record.candidateCount) > 5
      : record.candidateCount !== null) throw invalid();
    ids.add(record.id);
    venues.add(cafe.venueId);
    queries.add(identity(cafe));
  }
  return value as LookupRecord[];
}

export function createLookupHistory(filePath: string, now: () => Date = () => new Date()) {
  const path = resolve(filePath);
  const lockPath = `${path}.lock`;
  async function list(): Promise<LookupRecord[]> {
    try {
      if (!(await lstat(path)).isFile()) throw invalid();
      const payload: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!object(payload) || !exactKeys(payload, ['version', 'records']) || payload.version !== 1) throw invalid();
      return validateRecords(payload.records);
    } catch (error) {
      if (object(error) && error.code === 'ENOENT') return [];
      throw invalid();
    }
  }
  async function write(records: LookupRecord[]) {
    validateRecords(records);
    const temporary = `${dirname(path)}/.${basename(path)}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ version: 1, records }, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, path);
    } catch {
      throw new Error('Could not save lookup history. Stop before attempting another paid lookup.');
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
  return {
    list,
    async runOnce<T>(input: DiscoveryCafe, model: string, operation: () => Promise<{ value: T; candidateCount: number }>) {
      const cafe = validateCafe(input);
      if (!text(model)) throw new Error('Set OPENAI_DISCOVERY_MODEL before live discovery.');
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      let lock;
      try { lock = await open(lockPath, 'wx', 0o600); }
      catch { throw new Error('Lookup history is busy or cannot be locked. No discovery request was made.'); }
      try {
        const records = await list();
        const previous = records.find(record => record.cafe.venueId === cafe.venueId || identity(record.cafe) === identity(cafe));
        if (previous) return { skipped: true as const, record: previous };
        // Save the attempt before the API call. A crash or uncertain provider failure must not trigger another paid request.
        const record: LookupRecord = { id: randomUUID(), cafe, model, status: 'started',
          startedAt: now().toISOString(), finishedAt: null, candidateCount: null };
        records.push(record);
        await write(records);
        let result: { value: T; candidateCount: number };
        try { result = await operation(); }
        catch (error) {
          record.status = 'failed';
          record.finishedAt = now().toISOString();
          await write(records);
          throw error;
        }
        record.status = 'completed';
        record.finishedAt = now().toISOString();
        record.candidateCount = result.candidateCount;
        await write(records);
        return { skipped: false as const, record, value: result.value };
      } finally {
        await lock.close();
        await unlink(lockPath);
      }
    },
  };
}
