import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiServer } from '../server/index.js';
import { defaultDraft } from '../src/data/preferences.js';

// Only synthetic providers and loopback HTTP; never call Google, OpenAI or Ticketmaster.
const unexpected = async () => assert.fail('Unexpected provider call in offline contract test');
async function withApi(options, run) {
  const server = createApiServer({
    env: {},
    googleProvider: { discover: unexpected, routeMatrix: unexpected, photo: unexpected,
      searchLocations: unexpected, resolveLocation: unexpected },
    recommendationProvider: { rank: unexpected, interpret: unexpected },
    socialProvider: { discover: unexpected, preview: unexpected },
    eventsHandler: unexpected,
    ...options,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, headers = {}) => fetch(origin + path, body === undefined
    ? { headers }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try { await run(request); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('existing status contract is preserved and browser map keys do not enable private providers', async () => {
  await withApi({ env: { GOOGLE_MAPS_JS_KEY: 'mock-browser-key' } }, async request => {
    const response = await request('/api/status');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { venues: 'curated', recommendations: 'planner', socialDiscovery: 'unavailable' });
  });
  await withApi({ env: { GOOGLE_MAPS_API_KEY: 'mock-private-key', OPENAI_API_KEY: 'mock-openai-key' } }, async request => {
    assert.deepEqual(await (await request('/api/status')).json(), { venues: 'google', recommendations: 'openai', socialDiscovery: 'openai' });
  });
});

test('existing local location search works without credentials', async () => {
  await withApi({}, async request => {
    const response = await request('/api/locations/search', { query: 'Newtown', sessionToken: 'mock-session' });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source, 'local');
    assert.ok(data.suggestions.some(item => item.name === 'Newtown'));
    assert.equal((await request('/api/locations/search', { query: 'Newtown', sessionToken: '' })).status, 400);
  });
});

test('venue social previews and discovery remain independent of Google and never call live providers', async () => {
  const venue = { name: 'Royal Botanic Garden Sydney', address: 'Sydney NSW 2000', lat: -33.8645, lng: 151.2162 };
  const url = 'https://www.instagram.com/reel/MockGarden123/';
  const post = { url, platform: 'Instagram' };
  await withApi({ env: { OPENAI_API_KEY: 'mock-openai-key' }, socialProvider: {
    async discover(input) { assert.deepEqual(input, venue); return [post]; },
    async preview(input) { assert.equal(input, url); return post; },
  } }, async request => {
    assert.deepEqual(await (await request('/api/social/search', { venue })).json(), { posts: [post] });
    assert.deepEqual(await (await request('/api/social/preview', { url })).json(), { post });
    assert.equal((await request('/api/social/search', { venue: { ...venue, lat: -37.8 } })).status, 400);
    assert.equal((await request('/api/social/preview', { url: 'https://localhost/private' })).status, 400);
  });
  await withApi({ env: { OPENAI_API_KEY: 'mock-openai-key', OPENAI_SOCIAL_SEARCH: 'false' }, socialProvider: {
    discover: unexpected, preview: async () => post,
  } }, async request => {
    assert.equal((await request('/api/social/search', { venue })).status, 503);
    assert.deepEqual(await (await request('/api/social/preview', { url })).json(), { post });
    assert.equal((await (await request('/api/status')).json()).socialDiscovery, 'unavailable');
  });
});

test('existing credentials and unknown-endpoint errors retain their status and shapes', async () => {
  await withApi({}, async request => {
    for (const path of ['/api/venues', '/api/matrix']) {
      const response = await request(path, {});
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'Google credentials are not configured' });
    }
    for (const path of ['/api/recommendations', '/api/intent']) {
      const response = await request(path, {});
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'OpenAI is not configured' });
    }
    assert.equal((await request('/api/unknown', {})).status, 404);
    assert.equal((await request('/api/events', {})).status, 404);
  });
});

test('existing venues, matrix, photos and location resolution use their original provider contracts', async () => {
  const prefs = { ...defaultDraft(), date: '2026-10-18' };
  const venue = { id: 'mock-venue', lat: -33.86, lng: 151.21 };
  const location = { id: 'mock-place', name: 'Mock place', lat: -33.86, lng: 151.21 };
  const matrix = [[{ minutes: 0, distance: 0, source: 'google' }]];
  await withApi({ env: { GOOGLE_MAPS_API_KEY: 'mock-private-key' }, googleProvider: {
    async discover(input) { assert.deepEqual(input, prefs); return [venue]; },
    async routeMatrix(venues, input) { assert.deepEqual(venues, [venue]); assert.deepEqual(input, prefs); return matrix; },
    async photo(name) { assert.equal(name, 'places/mock/photos/mock'); return { type: 'image/jpeg', body: Buffer.from('mock-photo') }; },
    async resolveLocation(id, session) { assert.equal(id, 'mock-place'); assert.equal(session, 'mock-session'); return location; },
    searchLocations: unexpected,
  } }, async request => {
    assert.deepEqual(await (await request('/api/venues', { prefs })).json(), { venues: [venue] });
    assert.deepEqual(await (await request('/api/matrix', { prefs, venues: [venue] })).json(), { matrix });
    assert.deepEqual(await (await request('/api/locations/resolve', { placeId: 'mock-place', sessionToken: 'mock-session' })).json(), { location });
    const photo = await request('/api/photo?name=places%2Fmock%2Fphotos%2Fmock');
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal(await photo.text(), 'mock-photo');
    assert.equal((await request('/api/matrix', { prefs, venues: [{ ...venue, lat: 80 }] })).status, 400);
  });
});

test('existing intent and recommendation endpoints retain validation and response shapes', async () => {
  const prefs = { ...defaultDraft(), date: '2026-10-18' };
  const venue = { id: 'mock-venue', name: 'Mock venue', category: 'Mock', area: 'Sydney CBD', tags: [], cost: 20, mins: 45 };
  const rankings = [{ venueId: venue.id, fit: 7, exclude: false }];
  const intent = { mock: true };
  await withApi({ env: { OPENAI_API_KEY: 'mock-openai-key' }, recommendationProvider: {
    async interpret(input, signal) { assert.deepEqual(input, prefs); assert.ok(signal instanceof AbortSignal); return intent; },
    async rank(input, venues, signal) { assert.deepEqual(input, prefs); assert.deepEqual(venues, [venue]); assert.ok(signal instanceof AbortSignal); return rankings; },
  } }, async request => {
    assert.deepEqual(await (await request('/api/intent', { prefs })).json(), { intent });
    assert.deepEqual(await (await request('/api/recommendations', { prefs, venues: [venue] })).json(), { rankings });
    assert.equal((await request('/api/recommendations', { prefs, venues: [] })).status, 400);
    assert.equal((await request('/api/intent', { prefs: {} })).status, 400);
  });
});

test('Ticketmaster JSON data is additive without importing the generated map page', async () => {
  await withApi({ eventsHandler: async (req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ events: [], points: [], missingCoordinates: 0, mapAvailable: false }));
  } }, async request => {
    assert.deepEqual(await (await request('/api/events')).json(), { events: [], points: [], missingCoordinates: 0, mapAvailable: false });
    assert.equal((await request('/api/events-map')).status, 404);
    assert.deepEqual(await (await request('/api/status')).json(), { venues: 'curated', recommendations: 'planner', socialDiscovery: 'unavailable' });
  });
});

test('existing CORS allowlist and recommendation rate limit remain enforced', async () => {
  const prefs = { ...defaultDraft(), date: '2026-10-18' };
  await withApi({ env: { APP_ORIGINS: 'http://mock-app.test', OPENAI_API_KEY: 'mock-openai-key' },
    recommendationProvider: { interpret: async () => ({ mock: true }), rank: unexpected } }, async request => {
    const response = await request('/api/status', undefined, { Origin: 'http://mock-app.test' });
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://mock-app.test');
    for (let i = 0; i < 6; i++) assert.equal((await request('/api/intent', { prefs })).status, 200);
    assert.equal((await request('/api/intent', { prefs })).status, 429);
  });
});
