import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTikTokPlaces } from '../../apps/mobile/src/services/tiktokPlaces.ts';

const origin = 'https://api.melloway.test';
const sourceUrl = 'https://www.tiktok.com/@mock_fixture/video/9000000000000000001';
const place = { name: 'Mock Café', suburb: 'Newtown', sourceUrl, normalizedUrl: sourceUrl, postId: '9000000000000000001',
  evidence: 'Fictional test fixture', placeId: 'ChIJ_MOCK_1', discoveredAt: '2026-10-11T06:00:00.000Z', reviewStatus: 'pending',
  label: 'A', address: 'Fictional Test Street', latitude: -33.897, longitude: 151.179,
  mapsUri: 'https://www.google.com/maps/search/?api=1&query=Mock%20Café&query_place_id=ChIJ_MOCK_1' };
const data = () => ({ places: [{ ...place }], mapAvailable: true, missingCoordinates: 0, unmatchedCount: 1 });

test('mobile reads saved TikTok places through an absolute backend origin with no discovery call', async () => {
  let calls = 0;
  assert.deepEqual(await fetchTikTokPlaces(origin, async (url, options) => {
    calls++;
    assert.equal(url, `${origin}/api/tiktok-places`);
    assert.equal(options?.body, undefined);
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json(data());
  }), data());
  assert.equal(calls, 1);
  await assert.rejects(fetchTikTokPlaces('/api', async () => { assert.fail('must fail before fetch'); }), /Invalid URL/);
});

test('missing locations retain the source link and never become zero or demo coordinates', async () => {
  const missing = { ...data(), places: [{ ...place, address: null, latitude: null, longitude: null }], missingCoordinates: 1 };
  assert.deepEqual(await fetchTikTokPlaces(origin, async () => Response.json(missing)), missing);
});

test('foreign links, mismatched identities, duplicate places and impossible coordinates are rejected at the native boundary', async () => {
  for (const change of [
    { sourceUrl: 'https://evil.test/post' }, { normalizedUrl: 'https://vt.tiktok.com/MOCK/' }, { postId: '123' },
    { mapsUri: 'https://evil.test/maps/search/?query_place_id=ChIJ_MOCK_1' },
    { mapsUri: 'https://www.google.com/maps/search/?query_place_id=another' },
    { latitude: 0 }, { longitude: null }, { longitude: Infinity }, { reviewStatus: 'approved' },
  ]) {
    await assert.rejects(fetchTikTokPlaces(origin, async () => Response.json({ ...data(), places: [{ ...place, ...change }] })), /Invalid/);
  }
  for (const invalid of [null, {}, { ...data(), places: [place, place] }, { ...data(), missingCoordinates: 1 }]) {
    await assert.rejects(fetchTikTokPlaces(origin, async () => Response.json(invalid)), /Invalid/);
  }
});

test('provider HTTP failures return a safe connection error without response details', async () => {
  await assert.rejects(fetchTikTokPlaces(origin, async () => new Response('private API detail', { status: 502 })),
    { message: 'TikTok places could not be loaded.' });
});
