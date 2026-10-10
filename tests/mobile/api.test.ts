import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../../apps/mobile/src/services/config.ts';
import { createGoogleProvider } from '../../apps/mobile/src/services/api.ts';
import { defaultDraft, venues } from '@melloway/domain';

test('demo is the default and live mode requires an absolute endpoint', () => {
  assert.deepEqual(resolveConfig(), { mode: 'demo' });
  assert.deepEqual(resolveConfig('demo', '/api'), { mode: 'demo' });
  assert.deepEqual(resolveConfig('live', 'http://192.168.1.10:3001/'), { mode: 'live', apiUrl: 'http://192.168.1.10:3001' });
  for (const url of [undefined, '/api', 'https://example.com/api', 'ftp://example.com', 'https://user:password@example.com']) {
    assert.throws(() => resolveConfig('live', url));
  }
  assert.throws(() => resolveConfig('typo'));
});
test('mobile API uses the configured origin, resolves photo proxies and preserves unreachable edges', async t => {
  const prefs = defaultDraft();
  const venue = { ...venues[0], source: 'google' as const, image: '/api/photo?name=example' };
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push(String(url));
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(String(options.body)).prefs.area, prefs.area);
    return new Response(JSON.stringify(String(url).endsWith('/venues') ? { venues: [venue] } : { matrix: [[{ minutes: null, distance: 0, source: 'google' }]] }), { status: 200 });
  });
  const provider = createGoogleProvider('http://192.168.1.10:3001');
  const result = await provider.venues(prefs);
  assert.equal(result[0].image, 'http://192.168.1.10:3001/api/photo?name=example');
  assert.equal((await provider.matrix(result, prefs))[0][0].minutes, Infinity);
  assert.deepEqual(calls, ['http://192.168.1.10:3001/api/venues', 'http://192.168.1.10:3001/api/matrix']);
});
test('bad matrix dimensions and provider errors are reported for orchestration fallback', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ matrix: [] }), { status: 200 }));
  const provider = createGoogleProvider('https://example.com');
  await assert.rejects(provider.matrix([venues[0]], defaultDraft()), /Invalid route matrix/);
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(provider.venues(defaultDraft()), /Provider unavailable/);
});
