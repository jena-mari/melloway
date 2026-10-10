import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverSocialVideos } from '@melloway/domain';
import { createLocalReviewQueue } from '../server/discoveryReviewQueue.ts';
import { exportApprovedVideos } from '../server/discoveryExport.ts';
import { runReviewCommand } from '../scripts/discovery-review.ts';
import { mockCafe, mockNow, mockUrls, mockEvidence, mockResponse } from './fixtures/mock-openai-social-discovery.ts';

// Synthetic fixtures only; every decision/export uses a disposable OS temporary directory.
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'melloway-mock-export-'));
  const queuePath = join(directory, 'queue.json');
  const outputPath = join(directory, 'mock-approved.json');
  const candidates = await discoverSocialVideos(mockCafe, { mode: 'mock', async search() {
    return [...mockUrls, 'https://instagram.com/reel/MOCK_Pending-3/'].map(url => ({ url, snippet: mockEvidence }));
  } }, mockNow);
  return { directory, queuePath, outputPath, candidates, queue: createLocalReviewQueue(queuePath, mockNow),
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('regression: export contains approved records only, never pending or rejected items', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const [approve, reject, pending] = await f.queue.list();
    await f.queue.decide(approve.id, 'approved');
    await f.queue.decide(reject.id, 'rejected');
    const before = await readFile(f.queuePath, 'utf8');
    assert.deepEqual(await exportApprovedVideos(f.queuePath, f.outputPath, mockNow), { outputPath: f.outputPath, exported: 1 });
    const raw = await readFile(f.outputPath, 'utf8');
    const payload = JSON.parse(raw);
    assert.equal(payload.kind, 'melloway-approved-social-videos');
    assert.equal(payload.version, 1);
    assert.equal(payload.exportedAt, mockNow().toISOString());
    assert.deepEqual(payload.records, [(await f.queue.list())[0]]);
    assert.ok(!raw.includes(reject.id));
    assert.ok(!raw.includes(pending.id));
    assert.equal(await readFile(f.queuePath, 'utf8'), before);
    if (process.platform !== 'win32') assert.equal((await stat(f.outputPath)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(f.directory)).sort(), ['mock-approved.json', 'queue.json']);
  } finally { await f.cleanup(); }
});

test('no approved records yields an empty export without inventing results or modifying the queue', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const [first] = await f.queue.list();
    await f.queue.decide(first.id, 'rejected');
    const before = await readFile(f.queuePath, 'utf8');
    assert.equal((await exportApprovedVideos(f.queuePath, f.outputPath)).exported, 0);
    assert.deepEqual(JSON.parse(await readFile(f.outputPath, 'utf8')).records, []);
    assert.equal(await readFile(f.queuePath, 'utf8'), before);
  } finally { await f.cleanup(); }
});

test('invalid storage prevents export publication and preserves every input byte', async () => {
  const f = await fixture();
  try {
    for (const raw of ['not JSON', '{"version":1,"records":[{"status":"approved"}]}']) {
      await writeFile(f.queuePath, raw);
      await assert.rejects(exportApprovedVideos(f.queuePath, f.outputPath), /Invalid review queue data/);
      assert.equal(await readFile(f.queuePath, 'utf8'), raw);
      assert.deepEqual(await readdir(f.directory), ['queue.json']);
    }
  } finally { await f.cleanup(); }
});

test('exports cannot overwrite the source queue or any existing target file', async () => {
  const f = await fixture();
  try {
    await f.queue.importPending(f.candidates);
    const before = await readFile(f.queuePath, 'utf8');
    await assert.rejects(exportApprovedVideos(f.queuePath, f.queuePath), /different file/);
    await writeFile(f.outputPath, 'existing temporary fixture');
    await assert.rejects(exportApprovedVideos(f.queuePath, f.outputPath), /already exists/);
    assert.equal(await readFile(f.queuePath, 'utf8'), before);
    assert.equal(await readFile(f.outputPath, 'utf8'), 'existing temporary fixture');
    assert.deepEqual((await readdir(f.directory)).sort(), ['mock-approved.json', 'queue.json']);
  } finally { await f.cleanup(); }
});

const project = fileURLToPath(new URL('..', import.meta.url));
function command(queuePath: string, args: string[]) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/discovery-review.ts', '--queue', queuePath, ...args], {
    cwd: project, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, OPENAI_API_KEY: '', OPENAI_DISCOVERY_MODEL: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('end-to-end mock demonstration: one café → pending candidates → explicit fixture approval → approved-only export', async () => {
  const f = await fixture();
  try {
    const discovered = command(f.queuePath, ['mock', mockCafe.venueId, mockCafe.name, mockCafe.suburb, 'tests/fixtures/mock-review-search.json']);
    assert.equal(discovered.mode, 'mock');
    assert.equal(discovered.added, 2);
    const pending = command(f.queuePath, ['list']).records;
    assert.equal(pending.length, 2);
    assert.ok(pending.every((record: { status: string }) => record.status === 'pending'));
    const approval = command(f.queuePath, ['approve', pending[0].id]).record;
    assert.equal(approval.status, 'approved');
    assert.ok(approval.decidedAt);
    const exported = command(f.queuePath, ['export', f.outputPath]);
    assert.equal(exported.exported, 1);
    assert.deepEqual(JSON.parse(await readFile(f.outputPath, 'utf8')).records, [approval]);
    assert.equal(command(f.queuePath, ['list']).records[1].status, 'pending');
    const rejected = command(f.queuePath, ['reject', pending[1].id]).record;
    assert.equal(rejected.status, 'rejected');
    const second = join(f.directory, 'mock-approved-after-reject.json');
    assert.equal(command(f.queuePath, ['export', second]).exported, 1);
    assert.deepEqual(JSON.parse(await readFile(second, 'utf8')).records, [approval]);
  } finally { await f.cleanup(); }
});

test('explicit live CLI uses the bounded adapter with injected mocks and saves pending records only', async () => {
  const f = await fixture();
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_DISCOVERY_MODEL;
  try {
    process.env.OPENAI_API_KEY = 'mock-secret';
    process.env.OPENAI_DISCOVERY_MODEL = 'mock-compatible-model';
    let calls = 0;
    const result = await runReviewCommand(['--queue', f.queuePath, 'live', mockCafe.venueId, mockCafe.name, mockCafe.suburb], {
      fetcher: async (_url, options) => {
        calls++;
        const body = JSON.parse(String(options?.body));
        assert.equal(body.max_tool_calls, 2);
        assert.equal(body.tools[0].external_web_access, false);
        return Response.json(mockResponse());
      },
    });
    assert.ok('mode' in result);
    assert.equal(result.mode, 'live');
    assert.equal(calls, 1);
    assert.ok((await f.queue.list()).every(record => record.status === 'pending' && record.decidedAt === null));
    assert.equal((await exportApprovedVideos(f.queuePath, f.outputPath)).exported, 0);
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(runReviewCommand(['--queue', f.queuePath, 'live', mockCafe.venueId, mockCafe.name, mockCafe.suburb], {
      fetcher: async () => { throw new Error('Network forbidden'); },
    }), /OPENAI_API_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_DISCOVERY_MODEL; else process.env.OPENAI_DISCOVERY_MODEL = previousModel;
    await f.cleanup();
  }
});

test('export CLI rejects repository output paths outside the ignored research directory', async () => {
  const f = await fixture();
  try {
    await assert.rejects(runReviewCommand(['--queue', f.queuePath, 'export', join(project, 'must-not-create-export.json')]), /inside .local\/discovery/);
    assert.deepEqual(await readdir(f.directory), []);
  } finally { await f.cleanup(); }
});
