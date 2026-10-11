import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLookupHistory } from '../server/discoveryLookupHistory.ts';
import { runReviewCommand } from '../scripts/discovery-review.ts';
import { mockCafe, mockNow, mockResponse } from './fixtures/mock-openai-social-discovery.ts';

// Only synthetic cafés and injected fetchers. Never spend real API credits or touch real lookup history.
const previousKey = process.env.OPENAI_API_KEY;
const previousModel = process.env.OPENAI_DISCOVERY_MODEL;
beforeEach(() => { process.env.OPENAI_API_KEY = 'mock-key-never-sent'; process.env.OPENAI_DISCOVERY_MODEL = 'mock-model'; });
afterEach(() => {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  if (previousModel === undefined) delete process.env.OPENAI_DISCOVERY_MODEL; else process.env.OPENAI_DISCOVERY_MODEL = previousModel;
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'melloway-mock-lookups-'));
  const path = join(directory, 'lookup-history.json');
  const history = createLookupHistory(path, mockNow);
  return { directory, path, history, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('a completed lookup survives reopen and skips the same venue, query variations and model changes', async () => {
  const f = await fixture();
  let calls = 0;
  const operation = async () => { calls++; return { value: 'synthetic result', candidateCount: 2 }; };
  try {
    assert.deepEqual(await f.history.list(), []);
    const first = await f.history.runOnce(mockCafe, 'mock-model', operation);
    assert.equal(first.skipped, false);
    assert.equal(first.record.status, 'completed');
    assert.equal(first.record.candidateCount, 2);
    const before = await readFile(f.path, 'utf8');
    const reopened = createLookupHistory(f.path);
    for (const cafe of [mockCafe, { ...mockCafe, name: 'A renamed fixture' },
      { ...mockCafe, venueId: 'another-id', name: '  MOCK   CAFÉ (TEST) ', suburb: ' newtown ' }]) {
      const repeated = await reopened.runOnce(cafe, 'another-mock-model', operation);
      assert.equal(repeated.skipped, true);
      assert.deepEqual(repeated.record, first.record);
    }
    assert.equal(calls, 1);
    assert.equal(await readFile(f.path, 'utf8'), before);
    if (process.platform !== 'win32') assert.equal((await stat(f.path)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(f.directory), ['lookup-history.json']);
  } finally { await f.cleanup(); }
});

test('zero-result lookups are completed and do not trigger another request', async () => {
  const f = await fixture();
  let calls = 0;
  const operation = async () => { calls++; return { value: [], candidateCount: 0 }; };
  try {
    await f.history.runOnce(mockCafe, 'mock-model', operation);
    assert.equal((await f.history.list())[0].candidateCount, 0);
    assert.equal((await f.history.runOnce(mockCafe, 'mock-model', operation)).skipped, true);
    assert.equal(calls, 1);
  } finally { await f.cleanup(); }
});

test('attempts are saved before calling the provider and failed attempts are never retried automatically', async () => {
  const f = await fixture();
  let calls = 0;
  try {
    await assert.rejects(f.history.runOnce(mockCafe, 'mock-model', async () => {
      calls++;
      const [started] = await createLookupHistory(f.path).list();
      assert.equal(started.status, 'started');
      assert.equal(started.finishedAt, null);
      throw new Error('Private mock provider detail, never persisted');
    }), /Private mock provider detail/);
    const [record] = await f.history.list();
    assert.equal(record.status, 'failed');
    assert.equal(record.candidateCount, null);
    const raw = await readFile(f.path, 'utf8');
    assert.ok(!raw.includes('Private mock provider detail'));
    assert.equal((await createLookupHistory(f.path).runOnce(mockCafe, 'mock-model', async () => {
      calls++; return { value: [], candidateCount: 0 };
    })).skipped, true);
    assert.equal(calls, 1);
  } finally { await f.cleanup(); }
});

test('an interrupted started record remains skipped after reopening the history', async () => {
  const f = await fixture();
  try {
    await f.history.runOnce(mockCafe, 'mock-model', async () => ({ value: [], candidateCount: 0 }));
    const [record] = await f.history.list();
    await writeFile(f.path, JSON.stringify({ version: 1, records: [{ ...record,
      status: 'started', finishedAt: null, candidateCount: null }] }));
    let calls = 0;
    const repeated = await f.history.runOnce(mockCafe, 'mock-model', async () => {
      calls++; return { value: [], candidateCount: 0 };
    });
    assert.equal(repeated.skipped, true);
    assert.equal(repeated.record.status, 'started');
    assert.equal(calls, 0);
  } finally { await f.cleanup(); }
});

test('the history lock prevents concurrent paid requests for the same café', async () => {
  const f = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  try {
    const first = f.history.runOnce(mockCafe, 'mock-model', async () => {
      calls++; entered(); await waiting;
      return { value: [], candidateCount: 0 };
    });
    await started;
    await assert.rejects(createLookupHistory(f.path).runOnce(mockCafe, 'mock-model', async () => {
      calls++; return { value: [], candidateCount: 0 };
    }), /busy/);
    release();
    await first;
    assert.equal(calls, 1);
  } finally { release(); await f.cleanup(); }
});

test('malformed or symlink history and invalid café fields prevent requests without resetting files', async () => {
  const f = await fixture();
  let calls = 0;
  const operation = async () => { calls++; return { value: [], candidateCount: 0 }; };
  try {
    await f.history.runOnce(mockCafe, 'mock-model', operation);
    const [record] = await f.history.list();
    const malformed = ['not-json', '{}', JSON.stringify({ version: 2, records: [] }),
      JSON.stringify({ version: 1, records: [record, record] }),
      JSON.stringify({ version: 1, records: [{ ...record, status: 'unknown' }] }),
      JSON.stringify({ version: 1, records: [{ ...record, candidateCount: 6 }] }),
      JSON.stringify({ version: 1, records: [{ ...record, cafe: { ...mockCafe, secret: 'mock-secret' } }] })];
    for (const raw of malformed) {
      await writeFile(f.path, raw);
      await assert.rejects(f.history.runOnce(mockCafe, 'mock-model', operation), /Invalid lookup history/);
      assert.equal(await readFile(f.path, 'utf8'), raw);
    }
    await rm(f.path);
    const target = join(f.directory, 'target.json');
    await writeFile(target, 'Unrelated data');
    await symlink(target, f.path);
    await assert.rejects(f.history.runOnce(mockCafe, 'mock-model', operation), /Invalid lookup history/);
    assert.equal(await readFile(target, 'utf8'), 'Unrelated data');
    await assert.rejects(f.history.runOnce({ ...mockCafe, name: ' ' }, 'mock-model', operation), /exact name/);
    assert.equal(calls, 1);
  } finally { await f.cleanup(); }
});

test('live CLI skips repeated searches across queue filenames while preserving pending results', async () => {
  const f = await fixture();
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(mockResponse()); };
  try {
    const args = ['--queue', join(f.directory, 'first-queue.json'), 'live', mockCafe.venueId, mockCafe.name, mockCafe.suburb];
    const first = await runReviewCommand(args, { fetcher });
    assert.equal('added' in first && first.added, 2);
    const repeat = await runReviewCommand(['--queue', join(f.directory, 'second-queue.json'),
      'live', 'different-id', 'MOCK CAFÉ (TEST)', 'NEWTOWN'], { fetcher });
    assert.equal('skipped' in repeat && repeat.skipped, true);
    assert.equal(calls, 1);
    const listed = await runReviewCommand(['--queue', join(f.directory, 'first-queue.json'), 'list']);
    assert.equal(listed.records?.length, 2);
    assert.ok(listed.records?.every(record => 'status' in record && record.status === 'pending'));
    const history = await runReviewCommand(['--queue', join(f.directory, 'first-queue.json'), 'lookups']);
    assert.equal(history.records?.length, 1);
    assert.ok(!(await readdir(f.directory)).includes('second-queue.json'));
    assert.ok(!(await readFile(f.path, 'utf8')).includes('mock-key-never-sent'));
  } finally { await f.cleanup(); }
});

test('CLI prevents a queue/history filename collision before any API call or write', async () => {
  const f = await fixture();
  let calls = 0;
  try {
    await assert.rejects(runReviewCommand(['--queue', f.path, 'live',
      mockCafe.venueId, mockCafe.name, mockCafe.suburb], { fetcher: async () => {
      calls++; return Response.json(mockResponse());
    } }), /filename other than lookup-history.json/);
    assert.equal(calls, 0);
    assert.deepEqual(await readdir(f.directory), []);
  } finally { await f.cleanup(); }
});
