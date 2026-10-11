/** Approved-only, private JSON handoff. No app import or public publishing. */
import { randomUUID } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { createLocalReviewQueue, type ReviewRecord } from './discoveryReviewQueue.ts';

export interface ApprovedVideoRecord extends Omit<ReviewRecord, 'status' | 'decidedAt'> {
  status: 'approved';
  decidedAt: string;
}
export interface ApprovedVideoExport {
  kind: 'melloway-approved-social-videos';
  version: 1;
  exportedAt: string;
  notice: string;
  records: ApprovedVideoRecord[];
}

export async function exportApprovedVideos(queuePath: string, outputPath: string, now: () => Date = () => new Date()) {
  const target = resolve(outputPath);
  if (target === resolve(queuePath)) throw new Error('Export must use a different file from the review queue.');
  const records = await createLocalReviewQueue(queuePath).list(); // Validates the entire snapshot before output.
  const payload: ApprovedVideoExport = {
    kind: 'melloway-approved-social-videos', version: 1, exportedAt: now().toISOString(),
    notice: 'Private local curation, not secure multi-user moderation. Approval is not venue verification; labelled mock fixtures are not real research.',
    records: records.filter((record): record is ApprovedVideoRecord => record.status === 'approved' && record.decidedAt !== null),
  };
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${dirname(target)}/.${basename(target)}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    // Atomic publication without replacing any existing file (including another queue).
    await link(temporary, target);
  } catch {
    throw new Error('Export target already exists or could not be written. Choose a new file; the queue was not changed.');
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return { outputPath: target, exported: payload.records.length };
}
