/** Private local curation only; no authentication or secure multi-user moderation. */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { parseSocialMediaUrl, type DiscoveryCandidate } from '@melloway/domain';

export type ReviewDecision = 'approved' | 'rejected';
export interface ReviewRecord extends Omit<DiscoveryCandidate, 'status'> {
  id: string;
  status: 'pending' | ReviewDecision;
  decidedAt: string | null;
}

const candidateKeys = ['venueId', 'platform', 'postId', 'normalizedUrl', 'sourceUrl',
  'matchExplanation', 'uncertainty', 'discoveredAt', 'status'];
const recordKeys = [...candidateKeys, 'id', 'decidedAt'];
const invalid = () => new Error('Invalid review queue data. Existing records were not changed.');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
function isoTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
const identity = (record: Pick<ReviewRecord, 'venueId' | 'platform' | 'postId'>) =>
  JSON.stringify([record.venueId, record.platform, record.postId]);

function validCandidate(value: Record<string, unknown>): boolean {
  const video = parseSocialMediaUrl(value.normalizedUrl);
  const source = parseSocialMediaUrl(value.sourceUrl);
  return text(value.venueId) && value.venueId === value.venueId.trim()
    && !!video && !!source && video.platform === value.platform && video.id === value.postId
    && video.normalizedUrl === value.normalizedUrl && source.normalizedUrl === value.normalizedUrl
    && text(value.matchExplanation) && text(value.uncertainty) && isoTime(value.discoveredAt);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function validateRecords(value: unknown): ReviewRecord[] {
  if (!Array.isArray(value)) throw invalid();
  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const record of value) {
    if (!object(record) || !exactKeys(record, recordKeys) || !validCandidate(record)
      || !text(record.id) || ids.has(record.id)
      || typeof record.status !== 'string' || !['pending', 'approved', 'rejected'].includes(record.status)
      || (record.status === 'pending' ? record.decidedAt !== null : !isoTime(record.decidedAt))) throw invalid();
    const key = identity(record as unknown as ReviewRecord);
    if (identities.has(key)) throw invalid();
    ids.add(record.id);
    identities.add(key);
  }
  return value as ReviewRecord[];
}

export function createLocalReviewQueue(filePath: string, now: () => Date = () => new Date()) {
  const path = resolve(filePath);
  const lockPath = `${path}.lock`;

  async function list(): Promise<ReviewRecord[]> {
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

  async function write(records: ReviewRecord[]): Promise<void> {
    validateRecords(records);
    const temporary = `${dirname(path)}/.${basename(path)}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ version: 1, records }, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      // Same-directory rename replaces a complete file; the previous file is never truncated.
      await rename(temporary, path);
    } catch {
      throw new Error('Could not save review queue. Existing records were not changed.');
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }

  async function locked<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch { throw new Error('Review queue is busy or cannot be locked. No records were changed.'); }
    try { return await operation(); }
    finally {
      await lock.close();
      await unlink(lockPath);
    }
  }

  return {
    list,
    async importPending(input: readonly DiscoveryCandidate[]) {
      // Only pending candidates may enter via discovery. Validate before touching storage.
      if (!Array.isArray(input) || input.some(candidate => !object(candidate)
        || !exactKeys(candidate, candidateKeys) || !validCandidate(candidate) || candidate.status !== 'pending')) throw invalid();
      return locked(async () => {
        const records = await list();
        const seen = new Set(records.map(identity));
        let added = 0;
        for (const candidate of input) {
          const key = identity(candidate);
          if (seen.has(key)) continue; // Preserve the entire original record, including decisions/evidence/time.
          records.push({ ...candidate, id: randomUUID(), status: 'pending', decidedAt: null });
          seen.add(key);
          added++;
        }
        if (added) await write(records);
        return { added, duplicates: input.length - added, total: records.length };
      });
    },
    async decide(id: string, decision: ReviewDecision): Promise<ReviewRecord> {
      if (!text(id) || !['approved', 'rejected'].includes(decision)) throw new Error('Supply a candidate ID and an approve/reject decision.');
      return locked(async () => {
        const records = await list();
        const record = records.find(candidate => candidate.id === id);
        if (!record) throw new Error('Candidate ID was not found. No records were changed.');
        // Repeating a decision is idempotent; only an explicit opposite decision changes it.
        if (record.status !== decision) {
          record.status = decision;
          record.decidedAt = now().toISOString();
          await write(records);
        }
        return record;
      });
    },
  };
}
