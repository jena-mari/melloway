import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft } from '../src/data/preferences.js';
import { editorialPicks } from '../src/data/editorialPicks.js';
import { curatedVenuesForDate } from '../src/data/sydneyVenues.js';
import { recommendationVenuesForDate, schedulableEditorialPick } from '../src/data/recommendationCatalog.js';
import { sameBusiness, mergeDiscoveryPool } from '../src/engine/discoveryPool.ts';
import { interpretPreferences } from '../src/engine/preferences.js';
import { selectCandidates, venueRejection } from '../src/engine/filtering.js';
import { scoreVenue } from '../src/engine/scoring.js';
import { touristLandmark } from '../src/engine/venueSuitability.js';
import { applyRecommendations } from '../src/utils/recommendations.js';
import { generate, prepareBrowse } from '../src/services/discovery.js';
import { createGoogleProvider, discoveryQueries } from '../server/google.js';
import { createOpenAIProvider } from '../server/openai.js';

const date = '2026-10-17';
const prefs = { ...defaultDraft(), date, transport: 'Walking' };
function mockProviders(t, venues = [], ai = false) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = String(url).split('/api/')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push(endpoint);
    switch (endpoint) {
      case 'status': return Response.json({ venues: venues.length ? 'google' : 'curated', recommendations: ai ? 'openai' : 'planner' });
      case 'venues': return Response.json({ venues });
      case 'discovery': return Response.json({ venues: [], leads: [], researchStatus: 'sources' });
      case 'intent': return Response.json({ intent: interpretPreferences(body.prefs) });
      case 'recommendations': return Response.json({ rankings: body.venues.map(v => ({ venueId: v.id, fit: 7, exclude: false })) });
      default: throw new Error(`Unexpected provider request: ${endpoint}`);
    }
  });
  return requests;
}
function feasible(plan, input) {
  assert.ok(plan);
  assert.ok(plan.cost <= input.budget);
  assert.ok(plan.elapsed <= input.duration * 60);
  for (const stop of plan.stops) {
    assert.ok(stop.source !== 'demo');
    assert.equal(venueRejection(stop, input, plan.intent), null);
    assert.ok(stop.mins > 0 && Number.isFinite(stop.arrival));
  }
}

test('normal catalogue adds only usable Picks, preserves original facts and deduplicates Google identities', () => {
  const original = curatedVenuesForDate(date);
  const pool = recommendationVenuesForDate(date);
  const added = pool.filter(v => !original.some(existing => existing.id === v.id));
  assert.deepEqual(added.map(v => v.id).sort(), ['pick-matcha-chubby-westfield', 'pick-caterpillar-club', 'pick-joji-sydney', 'pick-mamuki-glebe'].sort());
  for (const record of original) {
    const actual = pool.find(v => v.id === record.id);
    for (const key of Object.keys(record)) assert.deepEqual(actual[key], record[key], `${record.id}: ${key}`);
  }
  for (const pick of added) {
    const record = editorialPicks.find(v => v.id === pick.id);
    for (const key of ['name', 'address', 'lat', 'lng', 'cost', 'weeklyHours', 'hoursStatus', 'conditions', 'sources'])
      assert.deepEqual(pick[key], record[key], `${pick.id}: ${key}`);
    assert.equal(pick.rating, undefined);
    assert.equal(pick.reviews, undefined);
  }
  assert.equal(pool.filter(v => v.name === 'Glebe Markets').length, 1);
  const chubby = added.find(v => v.id === 'pick-matcha-chubby-westfield');
  const duplicate = { ...chubby, id: 'google-fixture-chubby', source: 'google', address: 'Westfield Sydney, Level 1, 188 Pitt St, Sydney NSW 2000', cost: 999 };
  assert.ok(sameBusiness(chubby, duplicate));
  assert.equal(mergeDiscoveryPool(pool, [duplicate]).length, pool.length);
});

test('unknown access, membership, unknown hours and incomplete recurring events are never promoted', () => {
  const pool = recommendationVenuesForDate(date);
  for (const id of ['pick-ace-sydney-photobooth', 'pick-birdcage-bank-hotel', 'pick-o3-newtown', 'pick-old-school-kafey', 'pick-observatory-hill-park'])
    assert.ok(!pool.some(v => v.id === id), id);
  const usable = pool.find(v => v.id === 'pick-matcha-chubby-westfield');
  for (const overrides of [{ membershipRequired: true }, { accessStatus: 'unverified' }, { conditions: 'Membership applies' },
    { hoursStatus: 'unconfirmed' }, { weeklyHours: null }, { cost: null },
    { kind: 'recurring-event', eventSchedule: { weekday: 3, start: '21:00', end: '23:00' } },
    { kind: 'recurring-event', eventSchedule: { weekday: 6, start: '21:00', end: null } }])
    assert.equal(schedulableEditorialPick({ ...usable, ...overrides }, date), false);
  const sunday = { ...prefs, date: '2026-10-18' };
  assert.equal(venueRejection(pool.find(v => v.id === 'sydney-glebe-markets'), sunday, interpretPreferences(sunday)), 'hours');
});

for (const ai of [false, true]) {
  test(`Newtown matcha, thrifting and indie bookshops keeps all three activities (${ai ? 'mock AI' : 'offline'})`, async t => {
    mockProviders(t, [], ai);
    const input = { ...prefs, area: 'Newtown', notes: 'matcha, thrifting and indie bookshops' };
    const result = await generate(input);
    feasible(result.plan, input);
    assert.deepEqual(result.plan.sequence, ['cafe', 'shop', 'bookshop']);
    assert.ok(result.plan.stops[0].tags.includes('Matcha cafés'));
    assert.ok(result.plan.stops[1].tags.includes('Thrifting'));
    assert.equal(result.plan.stops[2].name, 'Better Read Than Dead');
    assert.ok(result.plan.stops.every(v => v.area === 'Newtown'));
    assert.ok(result.plan.stops.every(v => !touristLandmark(v)));
  });
}

test('comma/plus compound requests retain matcha, vintage browsing and a verified independent bookshop', async t => {
  mockProviders(t);
  for (const notes of ['I want matcha, vintage shopping and indie bookshops', 'I want matcha + vintage shops + indie bookshops']) {
    const input = { ...prefs, area: 'Newtown', notes };
    const result = await generate(input);
    feasible(result.plan, input);
    assert.deepEqual(result.plan.sequence, ['cafe', 'shop', 'bookshop']);
    assert.ok(result.plan.stops[0].tags.includes('Matcha cafés'));
    assert.ok(result.plan.stops[1].tags.includes('Vintage stores'));
    assert.match(result.plan.stops[2].description, /independent/);
    assert.ok(!result.plan.adjustments?.length);
  }
});

test('CBD casual date uses relevant local variety and a feasible editorial Pick', async t => {
  mockProviders(t);
  const input = { ...prefs, notes: 'casual date' };
  const result = await generate(input);
  feasible(result.plan, input);
  assert.ok(result.plan.stops.some(v => v.editorialPick));
  assert.ok(new Set(result.plan.sequence).size >= 2);
  assert.ok(result.plan.stops.every(v => !touristLandmark(v)));
  assert.ok(!result.plan.sequence.includes('culture') && !result.plan.sequence.includes('walk'));
});

test('tourist penalties are soft, disappear for sightseeing/explicit activities/venue names, and survive AI blending', () => {
  const gallery = recommendationVenuesForDate(date).find(v => v.id === 'sydney-art-gallery');
  const ordinary = scoreVenue(gallery, prefs, interpretPreferences(prefs));
  assert.equal(venueRejection(gallery, prefs, interpretPreferences(prefs)), null);
  assert.equal(ordinary.scoreBreakdown.touristLandmark, -24);
  for (const overrides of [{ notes: 'I want sightseeing' }, { preferences: ['Art galleries'] }, { notes: 'Include Art Gallery of New South Wales' }]) {
    const input = { ...prefs, ...overrides };
    assert.equal(scoreVenue(gallery, input, interpretPreferences(input)).scoreBreakdown.touristLandmark, 0);
  }
  assert.equal(interpretPreferences({ ...prefs, notes: 'no sightseeing or landmarks' }).sightseeing, false);
  const ranked = applyRecommendations([ordinary], [{ venueId: gallery.id, fit: 10, exclude: false }])[0];
  const policy = ordinary.scoreBreakdown.touristLandmark + ordinary.scoreBreakdown.unsolicitedFiller;
  assert.ok(Math.abs(ranked.score - ((ordinary.score - policy) * .65 + 35 + policy)) < 1e-9);
});

test('explicit sightseeing still produces a feasible landmark/culture route', async t => {
  mockProviders(t);
  const input = { ...prefs, notes: 'I want sightseeing' };
  const result = await generate(input);
  feasible(result.plan, input);
  assert.ok(result.plan.sequence.includes('culture'));
  assert.ok(result.plan.sequence.includes('walk'));
  assert.deepEqual(result.plan.intent.requestedActivities, []);
});

// Synthetic Places fixtures; these are not real venue names, hours or quotes.
const googlePlace = (id, name, types) => ({ id, displayName: { text: name }, types,
  formattedAddress: '1 Fixture Street, Sydney NSW 2000', location: { latitude: -33.873, longitude: 151.207 },
  businessStatus: 'OPERATIONAL', priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
  regularOpeningHours: { periods: [{ open: { day: 0, hour: 0 } }] } });

test('Google query labels never disguise service businesses or inflate unrelated activity tags', async () => {
  const bad = [googlePlace('studio', 'Fixture Photography Studio', ['photography_studio']),
    googlePlace('restoration', 'Fixture Photo Restoration', ['store']),
    googlePlace('hire', 'Fixture Event Hire', ['event_planner']),
    googlePlace('service', 'Fixture Services', ['consultant']),
    googlePlace('unknown', 'Fixture Business', [])];
  const good = [googlePlace('cafe', 'Fixture Coffee', ['cafe']), googlePlace('books', 'Fixture Books', ['book_store'])];
  const provider = createGoogleProvider('mock-only-key', async () => Response.json({ places: [...bad, ...good] }), { curated: () => [] });
  const { venues, debug } = await provider.discoverWithDebug(prefs);
  assert.deepEqual(discoveryQueries([]), ['Coffee shops', 'Bookshops', 'Photo booths']);
  assert.deepEqual(venues.map(v => [v.id, v.tags]), [['cafe', ['Coffee shops']], ['books', ['Bookshops']]]);
  assert.ok(debug.rejectedReasons['service-business'] >= 4);
  assert.ok(debug.rejectedReasons['category-mismatch'] >= 1);
  for (const p of bad.slice(0, 4)) {
    const misleading = { ...recommendationVenuesForDate(date)[0], id: p.id, name: p.displayName.text, source: 'google', providerTypes: p.types };
    assert.ok(venueRejection(misleading, prefs, interpretPreferences(prefs)));
  }
});

test('a generic café or shop cannot acquire matcha or vintage claims from the query alone', async () => {
  const provider = createGoogleProvider('mock-only-key', async () => Response.json({ places: [googlePlace('cafe', 'Fixture Coffee', ['cafe']),
    googlePlace('shop', 'Fixture Clothing', ['clothing_store'])] }), { curated: () => [] });
  assert.deepEqual(await provider.discover({ ...prefs, preferences: ['Matcha cafés', 'Vintage stores'] }), []);
});

test('legacy or cached provider responses cannot reintroduce a service business into generation or browsing', async t => {
  const bad = { ...recommendationVenuesForDate(date).find(v => v.id === 'pick-matcha-chubby-westfield'),
    id: 'fixture-old-studio', name: 'Fixture Photography Studio', source: 'google', providerTypes: ['photography_studio'] };
  mockProviders(t, [bad]);
  const result = await generate(prefs);
  assert.ok(result.candidates.every(v => v.id !== bad.id));
  const browse = await prepareBrowse(prefs);
  assert.ok(browse.candidates.every(v => v.id !== bad.id));
});

test('no suitable places gives an honest failure and never pads an itinerary with service businesses', async t => {
  const bad = googlePlace('studio', 'Fixture Photography Studio', ['photography_studio']);
  const provider = createGoogleProvider('mock-only-key', async () => Response.json({ places: [bad] }), { curated: () => [] });
  const discovered = await provider.discover(prefs);
  assert.deepEqual(discovered, []);
  const requests = mockProviders(t, discovered);
  const result = await generate({ ...prefs, time: '02:00', timeExplicit: true, duration: 3, budget: 0 });
  assert.equal(result.plan, null);
  assert.match(result.failure.message, /No sourced, open places nearby fit this time and budget/);
  assert.ok(!requests.includes('recommendations'));
});

test('Pick ranking never overrides budgets, closed hours, opt-outs or rejected venue IDs', () => {
  const pool = recommendationVenuesForDate(date);
  const chubby = pool.find(v => v.id === 'pick-matcha-chubby-westfield');
  assert.equal(venueRejection(chubby, { ...prefs, budget: 0 }, interpretPreferences(prefs)), 'budget');
  assert.equal(venueRejection(chubby, { ...prefs, time: '23:00' }, interpretPreferences(prefs)), 'hours');
  const optedOut = { ...prefs, notes: 'no matcha' };
  assert.ok(!selectCandidates(pool, optedOut, interpretPreferences(optedOut)).some(v => v.id === chubby.id));
  assert.ok(!selectCandidates(pool, prefs, interpretPreferences(prefs), { rejectedIds: [chubby.id] }).some(v => v.id === chubby.id));
  const joji = pool.find(v => v.id === 'pick-joji-sydney');
  const evening = { ...prefs, age: 17, time: '18:00' };
  assert.equal(venueRejection(joji, evening, interpretPreferences(evening)), 'access');
});

test('fallback never restores venues excluded by the ranking provider', async t => {
  const excluded = new Set();
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = String(url).split('/api/')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    if (endpoint === 'status') return Response.json({ venues: 'curated', recommendations: 'openai' });
    if (endpoint === 'intent') return Response.json({ intent: interpretPreferences(body.prefs) });
    if (endpoint === 'discovery') return Response.json({ venues: [], leads: [] });
    if (endpoint === 'recommendations') return Response.json({ rankings: body.venues.map(v => {
      excluded.add(v.id);
      return { venueId: v.id, fit: 0, exclude: true };
    }) });
    throw new Error(`Unexpected provider request: ${endpoint}`);
  });
  const result = await generate({ ...prefs, notes: 'matcha and bookshops' });
  assert.ok(excluded.size > 0);
  assert.ok(result.candidates.every(v => !excluded.has(v.id)));
  assert.ok(!result.plan || result.plan.stops.every(v => !excluded.has(v.id)));
});

test('mock AI ranking receives curation facts and locals-first guidance without invented popularity', async () => {
  const venue = recommendationVenuesForDate(date).find(v => v.id === 'pick-matcha-chubby-westfield');
  let request;
  const provider = createOpenAIProvider('mock-only-key', undefined, async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
      text: JSON.stringify({ rankings: [{ venueId: venue.id, fit: 8, exclude: false }] }) }] }] });
  });
  await provider.rank(prefs, [venue]);
  assert.match(request.instructions, /independently curated local experiences/);
  assert.equal(JSON.parse(request.input).places[0].editorialPick, true);
  assert.equal(JSON.parse(request.input).places[0].touristLandmark, false);
  assert.equal(JSON.parse(request.input).places[0].reviews, undefined);
});
