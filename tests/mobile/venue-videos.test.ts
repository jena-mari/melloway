import test from 'node:test';
import assert from 'node:assert/strict';
import { createVenueVideoStore, videosForVenue, VENUE_VIDEOS_KEY } from '../../apps/mobile/src/services/venueVideos.ts';

const tiktok = 'https://tiktok.com/@scout2015/video/6718335390845095173/?share=1';
const instagram = 'https://instagram.com/reel/DJf0_RmSd-T?igsh=test';
const now = () => new Date('2026-10-11T02:00:00.000Z');
function memory() {
  const data = new Map<string, string>([['melloway.mobile.v1', 'existing plans and favourites']]);
  const writes: string[] = [];
  return { data, writes, storage: {
    async getItem(key: string) { return data.get(key) ?? null; },
    async setItem(key: string, value: string) { writes.push(key); data.set(key, value); },
  } };
}

test('saves only the required normalized association fields under a separate storage key', async () => {
  const { data, writes, storage } = memory();
  const store = createVenueVideoStore(storage, now);
  const saved = await store.getState().add('carriageworks', tiktok, true);
  assert.deepEqual(saved, { venueId: 'carriageworks', platform: 'tiktok', postId: '6718335390845095173',
    normalizedUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', savedAt: now().toISOString() });
  assert.deepEqual(JSON.parse(data.get(VENUE_VIDEOS_KEY)!), [saved]);
  assert.deepEqual(writes, [VENUE_VIDEOS_KEY]);
  assert.equal(data.get('melloway.mobile.v1'), 'existing plans and favourites');
});

test('rejects unsupported links, unknown venue IDs and missing confirmation without writing', async () => {
  const { storage, writes } = memory();
  const store = createVenueVideoStore(storage, now);
  for (const url of ['', 'not a link', 'https://vm.tiktok.com/test/', 'https://instagram.com/p/ABC/', null]) {
    await assert.rejects(store.getState().add('carriageworks', url, true), /full TikTok/);
  }
  for (const venueId of ['unknown', '', null, 'google-place-id']) {
    await assert.rejects(store.getState().add(venueId, instagram, true), /Unknown demo venue/);
  }
  await assert.rejects(store.getState().add('carriageworks', instagram, false), /Confirm this video/);
  assert.deepEqual(writes, []);
});

test('duplicates use venue + platform + post ID despite username or URL parameter changes', async () => {
  const { storage } = memory();
  const store = createVenueVideoStore(storage, now);
  await store.getState().add('carriageworks', tiktok, true);
  await assert.rejects(store.getState().add('carriageworks',
    'https://www.tiktok.com/@anotheruser/video/6718335390845095173#changed', true), /already saved/);
  await store.getState().add('brunch-sh', tiktok, true);
  await store.getState().add('carriageworks', 'https://instagram.com/reel/6718335390845095173/', true);
  assert.equal(store.getState().videos.length, 3);
});

test('retrieval returns only the selected venue videos and rejects unknown venues', async () => {
  const store = createVenueVideoStore(memory().storage, now);
  await store.getState().add('carriageworks', tiktok, true);
  await store.getState().add('brunch-sh', instagram, true);
  assert.deepEqual(videosForVenue(store.getState().videos, 'carriageworks').map(video => video.platform), ['tiktok']);
  assert.deepEqual(videosForVenue(store.getState().videos, 'matcha-cbd'), []);
  assert.throws(() => videosForVenue(store.getState().videos, 'unknown'), /Unknown/);
});

test('restores after recreation, rejects persisted duplicates and preserves previous associations on another save', async () => {
  const { storage } = memory();
  const original = createVenueVideoStore(storage, now);
  await original.getState().add('carriageworks', instagram, true);
  const restored = createVenueVideoStore(storage, now);
  await restored.getState().load();
  assert.equal(restored.getState().hydrated, true);
  assert.deepEqual(restored.getState().videos, original.getState().videos);
  await assert.rejects(restored.getState().add('carriageworks', instagram, true), /already saved/);
  await restored.getState().add('brunch-sh', tiktok, true);
  assert.equal(restored.getState().videos.length, 2);
  const reopened = createVenueVideoStore(storage, now);
  // Adding before an explicit load must retain previously persisted records.
  await reopened.getState().add('matcha-cbd', instagram, true);
  assert.equal(reopened.getState().videos.length, 3);
});

test('simultaneous submissions retain different records and reject a rapid duplicate', async () => {
  const store = createVenueVideoStore(memory().storage, now);
  const results = await Promise.allSettled([
    store.getState().add('carriageworks', tiktok, true),
    store.getState().add('brunch-sh', instagram, true),
    store.getState().add('carriageworks', tiktok, true),
  ]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled', 'rejected']);
  assert.equal(store.getState().videos.length, 2);
});

test('failed writes do not show a saved association and can be retried', async () => {
  const { storage, data } = memory();
  let fail = true;
  const store = createVenueVideoStore({ ...storage, async setItem(key, value) {
    if (fail) throw new Error('storage unavailable');
    await storage.setItem(key, value);
  } }, now);
  await assert.rejects(store.getState().add('carriageworks', instagram, true), /Could not save/);
  assert.deepEqual(store.getState().videos, []);
  assert.equal(data.has(VENUE_VIDEOS_KEY), false);
  fail = false;
  await store.getState().add('carriageworks', instagram, true);
  assert.equal(store.getState().videos.length, 1);
});

test('unreadable storage blocks saving without overwriting records, and loading can be retried', async () => {
  const { storage, writes } = memory();
  let fail = true;
  const store = createVenueVideoStore({ ...storage, async getItem(key) {
    if (fail) throw new Error('read failed');
    return storage.getItem(key);
  } }, now);
  await assert.rejects(store.getState().add('carriageworks', tiktok, true), /Could not restore/);
  assert.equal(store.getState().hydrated, false);
  assert.match(store.getState().loadError, /Nothing was overwritten/);
  assert.deepEqual(writes, []);
  fail = false;
  await store.getState().add('carriageworks', tiktok, true);
  assert.equal(store.getState().loadError, '');
});

test('malformed or untrusted persisted associations cannot be loaded or overwritten by a new save', async () => {
  const { storage, data, writes } = memory();
  const valid = await createVenueVideoStore(storage, now).getState().add('carriageworks', instagram, true);
  for (const raw of ['not JSON', '{}', '[null]', JSON.stringify([valid, valid]),
    ...[{ venueId: 'unknown' }, { platform: 'tiktok' }, { postId: 'different' }, { savedAt: 'invalid' },
      { normalizedUrl: 'https://youtube.com/watch?v=abc' }].map(change => JSON.stringify([{ ...valid, ...change }]))]) {
    data.set(VENUE_VIDEOS_KEY, raw);
    const store = createVenueVideoStore(storage, now);
    const count = writes.length;
    await assert.rejects(store.getState().load(), /Could not restore/);
    await assert.rejects(store.getState().add('brunch-sh', tiktok, true), /Could not restore/);
    assert.equal(writes.length, count);
    assert.equal(data.get(VENUE_VIDEOS_KEY), raw);
  }
});
