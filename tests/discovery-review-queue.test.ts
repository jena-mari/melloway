import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverSocialVideos, type DiscoveryCandidate } from '@melloway/domain';
import { createLocalReviewQueue } from '../server/discoveryReviewQueue.ts';
import { mockCafe, mockNow, mockUrls, mockEvidence } from './fixtures/mock-openai-social-discovery.ts';

// All approvals/rejections target synthetic entries in disposable OS temp directories.
// Never read, mutate or approve records in the actual default review queue.
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'melloway-mock-review-'));
  const path = join(directory, 'queue.json');
  const candidates = await discoverSocialVideos(mockCafe, { mode: 'mock', async search() {
    return mockUrls.map(url => ({ url, snippet: mockEvidence }));
  } }, mockNow);
  return { directory, path, candidates, queue: createLocalReviewQueue(path, mockNow),
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('a missing queue lists zero entries without inventing data or writing a file', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.queue.list(), []);
    assert.deepEqual(await readdir(f.directory), []);
  } finally { await f.cleanup(); }
});

test('pending imports persist across reopen, preserving original links, evidence and private file permissions', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.queue.importPending(f.candidates), { added: 2, duplicates: 0, total: 2 });
    const original = await f.queue.list();
    assert.deepEqual(await createLocalReviewQueue(f.path).list(), original);
    assert.equal(JSON.parse(await readFile(f.path, 'utf8')).version, 1);
    assert.equal(new Set(original.map(record => record.id)).size, 2);
    assert.ok(original.every(record => record.status === 'pending' && record.decidedAt === null));
    for (let index = 0; index < original.length; index++) {
      const { id, decidedAt, ...candidate } = original[index];
      assert.ok(id);
      assert.equal(decidedAt, null);
      assert.deepEqual(candidate, f.candidates[index]);
    }
    if (process.platform !== 'win32') assert.equal((await stat(f.path)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(f.directory), ['queue.json']);
  } finally { await f.cleanup(); }
});

test('repeat imports and changed TikTok usernames deduplicate without overwriting original records', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const before = await readFile(f.path, 'utf8');
    const changed: DiscoveryCandidate = { ...f.candidates[0],
      normalizedUrl: 'https://www.tiktok.com/@changed_fixture/video/9000000000000000001',
      sourceUrl: 'https://www.tiktok.com/@changed_fixture/video/9000000000000000001?changed=fixture',
      matchExplanation: 'Changed mock evidence that must not overwrite prior evidence.',
      discoveredAt: '2026-10-12T06:00:00.000Z' };
    assert.deepEqual(await f.queue.importPending([...f.candidates, changed, changed]), { added: 0, duplicates: 4, total: 2 });
    assert.equal(await readFile(f.path, 'utf8'), before);
  } finally { await f.cleanup(); }
});

test('deduplication allows the same post for another venue or a different platform', async () => {
  const f = await fixture();
  try {
    const differentPlatform: DiscoveryCandidate = { ...f.candidates[0], platform: 'instagram',
      sourceUrl: 'https://www.instagram.com/reel/9000000000000000001/',
      normalizedUrl: 'https://www.instagram.com/reel/9000000000000000001/' };
    await f.queue.importPending([f.candidates[0], f.candidates[0],
      { ...f.candidates[0], venueId: 'another-mock-cafe' }, differentPlatform]);
    assert.equal((await f.queue.list()).length, 3);
  } finally { await f.cleanup(); }
});

test('explicit temporary-fixture approvals/rejections record times and survive reruns and reopen', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const records = await f.queue.list();
    await f.queue.decide(records[0].id, 'approved');
    await f.queue.decide(records[1].id, 'rejected');
    const before = await readFile(f.path, 'utf8');
    const extra = { ...f.candidates[1], venueId: 'another-mock-cafe' };
    await f.queue.importPending([...f.candidates, extra]);
    const reopened = await createLocalReviewQueue(f.path).list();
    assert.deepEqual(reopened.slice(0, 2), JSON.parse(before).records);
    assert.equal(reopened[0].decidedAt, mockNow().toISOString());
    assert.equal(reopened[1].decidedAt, mockNow().toISOString());
    assert.equal(reopened[2].status, 'pending');
    assert.equal(reopened[2].decidedAt, null);
  } finally { await f.cleanup(); }
});

test('repeat human decisions are idempotent; an explicit opposite decision updates only that record', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const [record, other] = await f.queue.list();
    await f.queue.decide(record.id, 'approved');
    const before = await readFile(f.path, 'utf8');
    const nextTime = () => new Date('2026-10-12T06:00:00.000Z');
    const reopened = createLocalReviewQueue(f.path, nextTime);
    await reopened.decide(record.id, 'approved');
    assert.equal(await readFile(f.path, 'utf8'), before);
    const rejected = await reopened.decide(record.id, 'rejected');
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.decidedAt, nextTime().toISOString());
    assert.deepEqual((await reopened.list())[1], other);
  } finally { await f.cleanup(); }
});

test('discovery cannot import approvals, decision metadata, unsupported links or mismatched provenance', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const before = await readFile(f.path, 'utf8');
    for (const changes of [{ status: 'approved' }, { decidedAt: mockNow().toISOString() },
      { platform: 'youtube' }, { sourceUrl: 'https://www.instagram.com/reel/DIFFERENT_MOCK/' },
      { normalizedUrl: 'https://vm.tiktok.com/MOCK/' }, { matchExplanation: '' },
      { uncertainty: ' ' }, { discoveredAt: 'invalid' }, { venueId: '' }, { postId: 'wrong' }]) {
      await assert.rejects(f.queue.importPending([{ ...f.candidates[0], ...changes } as DiscoveryCandidate]), /Invalid review queue data/);
      assert.equal(await readFile(f.path, 'utf8'), before);
    }
  } finally { await f.cleanup(); }
});

test('unknown IDs and invalid decisions do not mutate existing records', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const before = await readFile(f.path, 'utf8');
    await assert.rejects(f.queue.decide('unknown-mock-id', 'approved'), /not found/);
    await assert.rejects(f.queue.decide('', 'approved'), /candidate ID/);
    await assert.rejects(f.queue.decide((await f.queue.list())[0].id, 'pending' as 'approved'), /approve\/reject/);
    assert.equal(await readFile(f.path, 'utf8'), before);
  } finally { await f.cleanup(); }
});

test('malformed storage blocks listing, import and decisions without overwriting it', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const valid = (await f.queue.list())[0];
    const payload = (records: unknown) => JSON.stringify({ version: 1, records });
    const invalid = ['not JSON', '{}', 'null', payload({}), payload([null]),
      JSON.stringify({ version: 2, records: [] }), payload([valid, valid]),
      payload([valid, { ...valid, venueId: 'another', postId: valid.postId }]),
      ...[{ status: 'approved', decidedAt: null }, { status: 'pending', decidedAt: mockNow().toISOString() },
        { sourceUrl: 'https://youtube.com/shorts/MOCK' }, { platform: 'instagram' }, { discoveredAt: 'invalid' },
        { id: '' }, { status: 'published' }, { status: ['approved'], decidedAt: mockNow().toISOString() },
        { status: 1, decidedAt: mockNow().toISOString() }, { extraCredential: 'mock-secret-not-allowed' }]
        .map(change => payload([{ ...valid, ...change }]))];
    for (const raw of invalid) {
      await writeFile(f.path, raw);
      await assert.rejects(f.queue.list(), /Invalid review queue data/);
      await assert.rejects(f.queue.importPending(f.candidates), /Invalid review queue data/);
      await assert.rejects(f.queue.decide(valid.id, 'approved'), /Invalid review queue data/);
      assert.equal(await readFile(f.path, 'utf8'), raw);
      assert.deepEqual(await readdir(f.directory), ['queue.json']);
    }
  } finally { await f.cleanup(); }
});

test('exclusive lock blocks competing writers and retry preserves both imports', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending([f.candidates[0]]);
    await writeFile(`${f.path}.lock`, 'temporary test lock');
    const before = await readFile(f.path, 'utf8');
    await assert.rejects(f.queue.importPending([f.candidates[1]]), /busy/);
    await assert.rejects(f.queue.decide((await f.queue.list())[0].id, 'approved'), /busy/);
    assert.equal(await readFile(f.path, 'utf8'), before);
    await rm(`${f.path}.lock`);
    await createLocalReviewQueue(f.path).importPending([f.candidates[1]]);
    assert.equal((await f.queue.list()).length, 2);
  } finally { await f.cleanup(); }
});

test('symbolic-link queues are rejected without changing their target', async () => {
  const f = await fixture();
  try {
    const target = join(f.directory, 'target.json');
    await writeFile(target, 'unrelated fixture data');
    await symlink(target, f.path);
    await assert.rejects(f.queue.importPending(f.candidates), /Invalid review queue data/);
    assert.equal(await readFile(target, 'utf8'), 'unrelated fixture data');
  } finally { await f.cleanup(); }
});

test('simultaneous imports cannot lose either record when a busy writer is retried', async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(f.candidates.map(candidate =>
      createLocalReviewQueue(f.path).importPending([candidate])));
    assert.ok(results.some(result => result.status === 'fulfilled'));
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === 'rejected') {
        assert.match(String(result.reason), /busy/);
        await f.queue.importPending([f.candidates[index]]);
      }
    }
    assert.equal((await f.queue.list()).length, 2);
    assert.deepEqual(await readdir(f.directory), ['queue.json']);
  } finally { await f.cleanup(); }
});

const project = fileURLToPath(new URL('..', import.meta.url));
function cli(path: string, args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/discovery-review.ts', '--queue', path, ...args], {
    cwd: project, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, OPENAI_API_KEY: 'mock-key-must-never-be-used', OPENAI_DISCOVERY_MODEL: 'mock-model' },
  });
}

test('documented CLI persists labelled mock results, lists original links/evidence and reviews temporary entries', async () => {
  const f = await fixture();
  try {
    const args = ['mock', mockCafe.venueId, mockCafe.name, mockCafe.suburb, 'tests/fixtures/mock-review-search.json'];
    const first = cli(f.path, args);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).added, 2);
    const listed = cli(f.path, ['list']);
    assert.equal(listed.status, 0, listed.stderr);
    const data = JSON.parse(listed.stdout);
    assert.match(data.notice, /not secure multi-user moderation/);
    assert.equal(data.records[0].sourceUrl, mockUrls[0]);
    assert.match(data.records[0].matchExplanation, /Mock Café/);
    const approved = cli(f.path, ['approve', data.records[0].id]);
    assert.equal(approved.status, 0, approved.stderr);
    assert.equal(JSON.parse(approved.stdout).record.status, 'approved');
    assert.ok(Number.isFinite(Date.parse(JSON.parse(approved.stdout).record.decidedAt)));
    const rejected = cli(f.path, ['reject', data.records[1].id]);
    assert.equal(rejected.status, 0, rejected.stderr);
    const before = await readFile(f.path, 'utf8');
    const rerun = cli(f.path, args);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.equal(JSON.parse(rerun.stdout).added, 0);
    assert.equal(await readFile(f.path, 'utf8'), before);
  } finally { await f.cleanup(); }
});

test('CLI rejects live mode, mismatched/malformed fixtures and repository paths outside the ignored directory', async () => {
  const f = await fixture();
  try {
    assert.notEqual(cli(f.path, ['live']).status, 0);
    assert.notEqual(cli(f.path, ['mock', 'wrong-cafe', mockCafe.name, mockCafe.suburb, 'tests/fixtures/mock-review-search.json']).status, 0);
    const malformed = join(f.directory, 'bad-sources.json');
    await writeFile(malformed, '{"mode":"mock","sources":[]}');
    assert.notEqual(cli(f.path, ['mock', mockCafe.venueId, mockCafe.name, mockCafe.suburb, malformed]).status, 0);
    const unsafe = cli(join(project, 'must-not-write-research.json'), ['list']);
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /inside .local\/discovery/);
    const traversal = cli(join(project, '.local/discovery/../../must-not-write-research.json'), ['list']);
    assert.notEqual(traversal.status, 0);
    assert.deepEqual(await f.queue.list(), []);
  } finally { await f.cleanup(); }
});

test('default queue, lock and atomic-write files are ignored by Git', () => {
  const paths = ['.local/discovery/review-queue.json', '.local/discovery/review-queue.json.lock', '.local/discovery/.review-queue.json.mock.tmp'];
  const result = spawnSync('git', ['check-ignore', '--stdin'], { cwd: project, input: paths.join('\n'), encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), paths);
});
