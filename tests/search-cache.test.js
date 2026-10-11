import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchCache } from '../src/utils/searchCache.js';

test('identical concurrent searches share work, cache empty results, and isolate returned data', async () => {
  const cache = createSearchCache();
  let calls = 0, release;
  const load = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = cache.get('same', load), second = cache.get('same', load);
  await Promise.resolve();
  release({ venues: [] });
  const [a, b] = await Promise.all([first, second]);
  a.venues.push({ id: 'changed' });
  assert.deepEqual(b, { venues: [] });
  assert.deepEqual(await cache.get('same', load), { venues: [] });
  assert.equal(calls, 1);
});

test('successful searches survive reload, expire, and keep storage bounded', async () => {
  let timestamp = 100, raw = null, calls = 0;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const options = { now: () => timestamp, ttl: 1000, maxEntries: 2, storage: () => storage };
  const load = async () => ({ count: ++calls });
  const cache = createSearchCache(options);
  await cache.get('a', load);
  assert.deepEqual(await createSearchCache(options).get('a', load), { count: 1 });
  timestamp += 1000;
  assert.deepEqual(await createSearchCache(options).get('a', load), { count: 2 });
  await cache.get('b', load);
  await cache.get('c', load);
  await cache.get('d', load);
  assert.equal(JSON.parse(raw).length, 2);
});

test('errors and incomplete successes do not prevent a later retry', async () => {
  const cache = createSearchCache();
  await assert.rejects(cache.get('a', async () => { throw new Error('offline'); }), /offline/);
  await cache.get('a', async () => ({ incomplete: true }), { cacheable: () => false });
  assert.deepEqual(await cache.get('a', async () => ({ venues: [1] })), { venues: [1] });
});

test('cancelling one caller preserves a shared search, cancelling all callers permits retry', async () => {
  const cache = createSearchCache();
  let release, sharedSignal;
  const load = signal => { sharedSignal = signal; return new Promise(resolve => { release = resolve; }); };
  const a = new AbortController(), b = new AbortController();
  const first = cache.get('a', load, { signal: a.signal });
  const second = cache.get('a', load, { signal: b.signal });
  await Promise.resolve();
  a.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(sharedSignal.aborted, false);
  release({ venues: [1] });
  assert.deepEqual(await second, { venues: [1] });
  const c = new AbortController();
  const abandoned = cache.get('b', load, { signal: c.signal });
  await Promise.resolve();
  c.abort();
  await assert.rejects(abandoned, { name: 'AbortError' });
  assert.equal(sharedSignal.aborted, true);
  assert.deepEqual(await cache.get('b', async () => ({ venues: [2] })), { venues: [2] });
  release({ venues: ['stale'] });
  await Promise.resolve();
  assert.deepEqual(await cache.get('b', async () => assert.fail('stale work overwrote retry')), { venues: [2] });
});

test('blocked or malformed session storage falls back to memory', async () => {
  for (const storage of [() => { throw new Error('blocked'); }, () => ({ getItem: () => '[null]', setItem: () => { throw new Error('full'); } })]) {
    const cache = createSearchCache({ storage });
    await cache.get('a', async () => [1]);
    assert.deepEqual(await cache.get('a', async () => assert.fail('memory cache missed')), [1]);
  }
});
