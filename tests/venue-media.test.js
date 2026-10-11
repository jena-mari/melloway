import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaVenueKey, matchesMediaVenue, inferSocialContext, socialFit, createVenueMediaClient } from '../packages/domain/src/venueMedia.ts';
import { groundedPosts } from '../server/social.js';
import { addDiscoveredPlace } from '../src/services/placeActions.js';
import { editRoute, demoMatrix } from '../src/utils/planner.js';
import { defaultDraft } from '../src/data/preferences.js';
const venue = { id: 'test-cafe', name: 'Test Cafe', address: '12 King Street, Newtown NSW 2042', lat: -33.89, lng: 151.18,
  area: 'Newtown', tags: ['Café food'], source: 'demo', cost: 10, mins: 30, hours: { open: 540, close: 1320 } };
const url = 'https://www.tiktok.com/@fixture/video/7123456789012345678';
const match = { venueName: venue.name, venueAddress: venue.address, locationEvidence: `${venue.name}, ${venue.address}` };
const media = caption => ({ url, platform: 'TikTok', id: '7123456789012345678', caption, venueKey: mediaVenueKey(venue), metadataSource: 'official-oembed' });

test('media requires exact name and branch evidence, beyond a grounded URL', () => {
  assert.equal(matchesMediaVenue(venue, match), true);
  for (const candidate of [{ ...match, venueAddress: '99 King Street, Newtown NSW 2042' },
    { ...match, locationEvidence: 'Test Cafe in Sydney' }, { ...match, locationEvidence: `${match.locationEvidence} Melbourne` },
    { ...match, venueName: 'Another Cafe' }]) assert.equal(matchesMediaVenue(venue, candidate), false);
  const response = candidate => ({ output: [{ action: { sources: [{ url }] } }, { content: [{ type: 'output_text', text: JSON.stringify({ posts: [{ url, matchesVenue: true, ...candidate }] }) }] }] });
  assert.equal(groundedPosts(response(match), venue).length, 1);
  assert.equal(groundedPosts(response({ ...match, locationEvidence: 'Test Cafe' }), venue).length, 0);
});

test('inferred context is bounded, negation aware, branch specific and never changes facts', () => {
  const snapshot = structuredClone(venue);
  const context = inferSocialContext(venue, [media('Quiet and cosy. #MatchaCafe with a romantic date night atmosphere.'), { ...media('Not quiet. Never romantic.'), url: 'https://www.instagram.com/reel/AnotherPost123/' }, { ...media('Lively nightlife'), venueKey: 'another branch' }, { ...media('Outdoor'), metadataSource: undefined }]);
  assert.deepEqual(context.atmosphere.sort(), ['quiet', 'relaxed', 'romantic']);
  assert.deepEqual(inferSocialContext(venue, [media('Not quiet. Never romantic.')]).atmosphere, []);
  assert.equal(socialFit(venue, context, { atmosphere: ['quiet'] }), 6);
  assert.equal(socialFit(venue, { ...context, sources: [...context.sources, ...context.sources] }, { atmosphere: ['quiet'] }), 6);
  assert.equal(socialFit({ ...venue, address: '99 King Street, Newtown NSW 2042' }, context, { atmosphere: ['quiet'] }), 0);
  assert.deepEqual(venue, snapshot);
});

test('media cache shares work, isolates viewer cancellation, excludes private data and expires', async () => {
  let calls = 0, release, time = 1, body;
  const gate = new Promise(resolve => { release = resolve; });
  const client = createVenueMediaClient('https://api.test', async (target, options) => {
    calls++;
    if (target.endsWith('/status')) return { ok: true, json: async () => ({ socialDiscovery: 'openai' }) };
    body = JSON.parse(options.body);
    await gate;
    return { ok: true, json: async () => ({ posts: [media('Quiet'), { ...media('Wrong branch'), url: 'https://www.instagram.com/reel/OtherPost123/', venueKey: 'wrong' }] }) };
  }, () => time);
  const abort = new AbortController();
  const first = client.discover({ ...venue, privateName: 'private' }, abort.signal);
  const second = client.discover(venue);
  abort.abort(); await assert.rejects(first); release();
  assert.equal((await second).length, 1);
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(body.venue).sort(), ['address', 'lat', 'lng', 'name']);
  await client.discover(venue); assert.equal(calls, 2);
  time += 6 * 3600000 + 1; await client.discover(venue); assert.equal(calls, 4);
});

test('transient discovery errors are retried rather than cached as an empty gallery', async () => {
  let calls = 0;
  const client = createVenueMediaClient('', async () => { calls++; throw new Error('offline'); });
  await assert.rejects(client.discover(venue)); await assert.rejects(client.discover(venue)); assert.equal(calls, 2);
});

test('discovery insertion preserves route identity, existing order and fixed times; rejects unsafe fits', async () => {
  const a = { ...venue, id: 'first', name: 'First', arrivalOverride: 720 }, b = { ...venue, id: 'last', name: 'Last', lng: 151.181 };
  const prefs = { ...defaultDraft(), date: '2026-10-12', area: 'Newtown', time: '11:00', duration: 8, budget: 100, transport: 'Not selected' };
  const matrix = demoMatrix([a, b], prefs.transport);
  const plan = { ...editRoute([a, b], prefs, [a, b], matrix), id: 'keep-id', status: 'in-progress', startedAt: '2026-10-12T00:00:00Z', prefs, createdAt: 'original' };
  const current = { plan, candidates: [a, b], matrix };
  const snapshot = structuredClone(current);
  const next = await addDiscoveredPlace(current, venue);
  assert.equal(next.plan.id, plan.id); assert.equal(next.plan.startedAt, plan.startedAt); assert.equal(next.plan.status, 'in-progress');
  assert.deepEqual(next.plan.stops.filter(stop => stop.id !== venue.id).map(stop => stop.id), ['first', 'last']);
  assert.equal(next.plan.stops.find(stop => stop.id === 'first').arrival, 720);
  assert.equal(next.plan.cost, 30); assert.equal(next.matrix.length, 3);
  assert.deepEqual(current, snapshot);
  await assert.rejects(addDiscoveredPlace(current, { ...venue, cost: 200 }), /time or budget/);
  await assert.rejects(addDiscoveredPlace(current, { ...venue, hours: undefined }), /opening hours/);
  await assert.rejects(addDiscoveredPlace(current, { ...venue, cost: null }), /price or visit length/);
});
