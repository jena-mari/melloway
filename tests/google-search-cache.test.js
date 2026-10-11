import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleProvider } from '../server/google.js';
import { defaultDraft } from '../src/data/preferences.js';

const prefs = { ...defaultDraft(), date: '2026-10-18', preferences: ['Bookshops'] };
const place = { id: 'fixture-books', displayName: { text: 'Fixture Books' }, formattedAddress: '1 Fixture St, Sydney NSW 2000',
  location: { latitude: -33.872, longitude: 151.208 }, types: ['book_store'], businessStatus: 'OPERATIONAL',
  priceLevel: 'PRICE_LEVEL_INEXPENSIVE', regularOpeningHours: { periods: [{ open: { day: 0, hour: 0 } }] } };

test('Places searches are shared and cached by query and location, then expire', async () => {
  let calls = 0, time = 1;
  const provider = createGoogleProvider('mock-only', async () => { calls++; return Response.json({ places: [place] }); },
    { curated: () => [], now: () => time });
  const results = await Promise.all([provider.discoverWithDebug(prefs), provider.discoverWithDebug(prefs)]);
  assert.equal(calls, 1);
  assert.equal(results[0].venues[0].id, place.id);
  await provider.discover({ ...prefs, budget: 40 }); // Reprocess cached facts with the current constraints.
  assert.equal(calls, 1);
  await provider.discover({ ...prefs, preferences: ['Desserts'] });
  assert.equal(calls, 2);
  await provider.discover({ ...prefs, area: 'Surry Hills' });
  assert.equal(calls, 3);
  time += 30 * 60000;
  await provider.discover(prefs);
  assert.equal(calls, 4);
});

test('failed and malformed Places searches retry; successful empty searches are cached', async () => {
  let calls = 0;
  const provider = createGoogleProvider('mock-only', async () => {
    calls++;
    return calls === 1 ? Response.json({}, { status: 503 }) : Response.json({ places: calls === 2 ? {} : [] });
  }, { curated: () => [] });
  for (let i = 0; i < 2; i++) await assert.rejects(provider.discoverWithDebug(prefs), /Google provider unavailable/);
  for (let i = 0; i < 2; i++) assert.deepEqual(await provider.discover(prefs), []);
  assert.equal(calls, 3);
});
