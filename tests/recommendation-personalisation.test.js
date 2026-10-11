import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft } from '../src/data/preferences.js';
import { preferencesForPlan } from '../src/utils/interests.js';
import { recommendationVenuesForDate } from '../src/data/recommendationCatalog.js';
import { interpretPreferences, mergeIntent } from '../src/engine/preferences.js';
import { scoreVenue } from '../src/engine/scoring.js';
import { selectCandidates, venueRejection, candidateDiagnostics } from '../src/engine/filtering.js';
import { independentBookshop, explicitlyRequestedVenue, bindRequestedVenues } from '../src/engine/venueIdentity.js';
import { createRecommendationHistory, RECENT_RECOMMENDATIONS_KEY, recentRecommendationCount } from '../src/engine/recommendationHistory.js';
import { applyRecommendations } from '../src/utils/recommendations.js';
import { generate } from '../src/services/discovery.js';
import { recommendationInput } from '../server/openai.js';

const prefs = { ...defaultDraft(), date: '2026-10-17', transport: 'Walking' };
const pool = recommendationVenuesForDate(prefs.date);
const kino = pool.find(venue => venue.id === 'sydney-kinokuniya');
const indie = pool.find(venue => venue.id === 'sydney-better-read');

// All provider copies below are synthetic test data, not real business claims.
const fixture = (id, name, extra = {}) => ({ ...kino, id: `fixture-${id}`, name,
  address: `${id + 1} Fixture Street, Sydney NSW 2000`, source: 'google',
  providerTypes: ['book_store'], website: 'https://example.com/fixture',
  description: 'Synthetic test fixture.', sources: [], ...extra });
function providers(t, venues, ai = false) {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = String(url).split('/api/')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    switch (endpoint) {
      case 'status': return Response.json({ venues: 'google', recommendations: ai ? 'openai' : 'planner' });
      case 'venues': return Response.json({ venues });
      case 'discovery': return Response.json({ venues: [], leads: [], researchStatus: 'sources' });
      case 'intent': return Response.json({ intent: interpretPreferences(body.prefs) });
      case 'recommendations': return Response.json({ rankings: body.venues.map(venue => ({
        venueId: venue.id, fit: venue.id === kino.id ? 10 : 8, exclude: false,
      })) });
      case 'matrix': throw new Error('Mock routing unavailable: use estimated travel');
      default: throw new Error(`Unexpected provider: ${endpoint}`);
    }
  });
}
function feasible(plan, input) {
  assert.ok(plan);
  assert.ok(plan.cost <= input.budget);
  assert.ok(plan.elapsed <= input.duration * 60);
  assert.ok(plan.stops.every(venue => !venueRejection(venue, input, plan.intent)));
}

test('indie idea and typed notes preserve verified independence through intent and AI blending', () => {
  for (const values of [{ idea: 'books-art', ideaExplicit: true }, { notes: 'indie bookshops' }, { notes: 'independent bookstores' }]) {
    const draft = { ...prefs, area: 'Newtown', ...values };
    const input = { ...draft, preferences: preferencesForPlan(draft) };
    const intent = interpretPreferences(input);
    assert.equal(intent.preferIndependentBookshops, true);
    assert.equal(mergeIntent(intent, interpretPreferences(prefs)).preferIndependentBookshops, true);
    const chain = fixture(0, 'Dymocks', { lat: indie.lat, lng: indie.lng, area: 'Newtown' });
    const scored = [indie, chain].map(venue => scoreVenue(venue, input, intent));
    assert.equal(scored[0].scoreBreakdown.independentBookshop, 80);
    assert.equal(scored[1].scoreBreakdown.independentBookshop, 0);
    assert.ok(scored[0].score > scored[1].score);
    const ranked = applyRecommendations(scored, scored.map(venue => ({ venueId: venue.id,
      fit: venue.id === indie.id ? 5 : 10, exclude: false })));
    assert.ok(ranked[0].score > ranked[1].score);
    assert.equal(recommendationInput({ ...input, intent }, scored).preferences.preferIndependentBookshops, true);
    assert.deepEqual(recommendationInput({ ...input, intent }, scored).places.map(venue => venue.independentBookshop), [true, false]);
  }
  const excluded = { ...prefs, idea: 'books-art', ideaExplicit: true, notes: 'no bookshops' };
  assert.equal(interpretPreferences(excluded).preferIndependentBookshops, false);
  assert.equal(independentBookshop(fixture(1, 'Indie Books', { description: 'An independent bookstore.' })), false);
  assert.equal(independentBookshop({ ...indie, description: 'No longer independent.' }), false);
});

test('indie preference cannot override feasibility or fabricate an alternative where none fits', async t => {
  providers(t, []);
  const input = { ...prefs, area: 'Newtown', notes: 'indie bookshops' };
  const result = await generate(input);
  feasible(result.plan, input);
  assert.ok(result.plan.stops.some(venue => venue.id === indie.id));
  assert.equal(venueRejection(indie, { ...input, time: '22:00', timeExplicit: true }, interpretPreferences(input)), 'hours');
  const onlyChain = { ...prefs, preferences: ['Bookshops'], idea: 'books-art', ideaExplicit: true };
  assert.ok(selectCandidates([kino], onlyChain, interpretPreferences(onlyChain)).some(venue => venue.id === kino.id));
  const available = await generate({ ...onlyChain, selectedPreferences: ['Bookshops'] });
  feasible(available.plan, onlyChain);
  assert.ok(available.plan.stops.some(venue => venue.id === kino.id));
});

for (const ai of [false, true]) test(`five consecutive plans avoid Kinokuniya repeats with suitable bookshop alternatives (${ai ? 'mock AI' : 'planner'})`, async t => {
  providers(t, Array.from({ length: 5 }, (_, i) => fixture(i, `Fixture bookshop ${i + 1}`)), ai);
  const memory = createRecommendationHistory();
  const input = { ...prefs, preferences: ['Bookshops'], selectedPreferences: ['Bookshops'] };
  const names = [];
  for (let i = 0; i < 5; i++) {
    const result = await generate(input, i, () => {}, null, { recommendationHistory: memory });
    feasible(result.plan, input);
    const books = result.plan.stops.filter(venue => venue.activityRole === 'bookshop');
    assert.equal(books.length, 1);
    names.push(books[0].name);
  }
  assert.equal(names[0], kino.name);
  assert.equal(new Set(names).size, 5, names.join(' → '));
  assert.equal(names.filter(name => name === kino.name).length, 1);
});

test('recent memory persists five small identity snapshots and recognises Google/curated duplicates', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const memory = createRecommendationHistory({ storage: () => storage });
  for (let i = 0; i < 7; i++) memory.record({ stops: [kino], prefs: { notes: 'private' }, review: { text: 'private' } });
  const reloaded = createRecommendationHistory({ storage: () => storage });
  assert.equal(reloaded.read().length, 5);
  const duplicate = { ...kino, id: 'google-kino', source: 'google', name: 'Kinokuniya',
    address: '500 George St, Sydney NSW 2000' };
  assert.equal(recentRecommendationCount(duplicate, reloaded.read()), 5);
  const serialized = values.get(RECENT_RECOMMENDATIONS_KEY);
  assert.ok(!serialized.includes('private') && !serialized.includes('rating') && !serialized.includes('weeklyHours'));
  values.set(RECENT_RECOMMENDATIONS_KEY, '{broken');
  assert.equal(reloaded.read().length, 5);
  const unavailable = createRecommendationHistory({ storage: () => { throw new Error('storage disabled'); } });
  unavailable.record({ stops: [kino] });
  assert.equal(unavailable.read().length, 1);
});

test('previous plans apply venue memory even when a caller does not supply a history store', async t => {
  providers(t, [fixture(1, 'Fixture alternative bookstore')]);
  const input = { ...prefs, preferences: ['Bookshops'] };
  const first = await generate(input);
  const second = await generate(input, 1, () => {}, first.plan);
  assert.equal(first.plan.stops.find(venue => venue.activityRole === 'bookshop').id, kino.id);
  assert.notEqual(second.plan.stops.find(venue => venue.activityRole === 'bookshop').id, kino.id);
});

test('existing current/history plans seed bounded memory without retaining private answers', () => {
  const initial = [{ stops: [kino], prefs: { notes: 'private' } }, { stops: [indie] }];
  const memory = createRecommendationHistory({ initialPlans: () => initial });
  assert.equal(recentRecommendationCount(kino, memory.read()), 1);
  assert.equal(recentRecommendationCount(indie, memory.read()), 1);
  memory.record({ stops: [kino] });
  assert.equal(memory.read().length, 3);
  assert.equal(recentRecommendationCount(kino, memory.read()), 2);
  assert.ok(!JSON.stringify(memory.read()).includes('private'));
});

test('an explicit Kinokuniya request overrides recent memory and an AI exclusion, while constraints still apply', async t => {
  providers(t, []);
  const memory = createRecommendationHistory();
  memory.record({ stops: [kino] });
  for (const notes of ['Kinokuniya', 'I want Kinokuniya', 'Include Books Kinokuniya Sydney', 'Visit Books Kinokuniya Sydney']) {
    const input = { ...prefs, notes };
    const result = await generate(input, 0, () => {}, null, { recommendationHistory: memory });
    feasible(result.plan, input);
    const stop = result.plan.stops.find(venue => venue.id === kino.id);
    assert.ok(stop, notes);
    assert.equal(stop.scoreBreakdown.recentRecommendation, 0);
    assert.deepEqual(result.plan.intent.requestedVenueIds, [kino.id]);
  }
  assert.equal(explicitlyRequestedVenue(kino, 'no Kinokuniya'), false);
  assert.equal(explicitlyRequestedVenue(kino, 'books'), false);
  const closed = await generate({ ...prefs, notes: 'Kinokuniya', time: '02:00', timeExplicit: true },
    0, () => {}, null, { recommendationHistory: memory });
  assert.equal(closed.plan, null);
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = String(url).split('/api/')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    if (endpoint === 'status') return Response.json({ recommendations: 'openai' });
    if (endpoint === 'intent') return Response.json({ intent: interpretPreferences(body.prefs) });
    if (endpoint === 'discovery') return Response.json({ venues: [], leads: [] });
    if (endpoint === 'recommendations') return Response.json({ rankings: body.venues.map(venue => ({ venueId: venue.id, fit: 8, exclude: venue.id === kino.id })) });
    throw new Error('Mock unavailable');
  });
  const explicit = await generate({ ...prefs, notes: 'Kinokuniya' });
  assert.ok(explicit.plan.stops.some(venue => venue.id === kino.id));
});

test('casual local dates avoid a synthetic tourist candidate; sightseeing and named requests still honour it', async t => {
  const tower = fixture(2, 'Sydney Tower Eye', { category: 'Photo spots', tags: ['Photo spots', 'Scenic walks'],
    roles: undefined, providerTypes: ['observation_deck', 'tourist_attraction'], mins: 30 });
  providers(t, [tower]);
  const memory = createRecommendationHistory();
  for (let i = 0; i < 5; i++) {
    const input = { ...prefs, notes: 'casual local date' };
    const result = await generate(input, i, () => {}, null, { recommendationHistory: memory });
    feasible(result.plan, input);
    assert.ok(result.plan.stops.every(venue => !['culture', 'walk'].includes(venue.activityRole)));
    assert.ok(result.plan.stops.every(venue => venue.id !== tower.id));
  }
  assert.equal(venueRejection(tower, prefs, interpretPreferences(prefs)), null);
  const sightseeing = { ...prefs, notes: 'I want sightseeing' };
  assert.equal(scoreVenue(tower, sightseeing, interpretPreferences(sightseeing)).scoreBreakdown.touristLandmark, 0);
  const input = { ...prefs, notes: 'I want Sydney Tower Eye' };
  const result = await generate(input);
  feasible(result.plan, input);
  assert.ok(result.plan.stops.some(venue => venue.id === tower.id));
});

test('sparse catalogues may repeat necessary venues rather than violate hours, area or a requested activity', async t => {
  providers(t, []);
  const memory = createRecommendationHistory();
  const input = { ...prefs, preferences: ['Bookshops'] };
  for (let i = 0; i < 5; i++) {
    const result = await generate(input, i, () => {}, null, { recommendationHistory: memory });
    feasible(result.plan, input);
    assert.ok(result.plan.stops.some(venue => venue.id === kino.id));
  }
  const before = memory.read();
  const failed = await generate({ ...prefs, time: '02:00', timeExplicit: true, budget: 0, duration: 3 },
    0, () => {}, null, { recommendationHistory: memory });
  assert.equal(failed.plan, null);
  assert.deepEqual(memory.read(), before);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generate(input, 0, () => {}, null, { signal: controller.signal, recommendationHistory: memory }));
  assert.deepEqual(memory.read(), before);
});

test('offline diagnostics expose the same scores, tags, memory and hard rejection reasons as the shortlist', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => { requests++; throw new Error('Offline providers disabled'); });
  const result = await generate(prefs, 0, () => {}, null, { offline: true });
  assert.equal(requests, 0);
  feasible(result.plan, prefs);
  const recentPlans = [{ stops: [kino] }];
  const intent = bindRequestedVenues(interpretPreferences(prefs), prefs, pool);
  const rows = candidateDiagnostics(pool, prefs, intent, { recentPlans, rejectedIds: [kino.id] });
  const kinoRow = rows.find(row => row.id === kino.id);
  assert.equal(kinoRow.rejection, 'rejected');
  assert.equal(kinoRow.shortlisted, false);
  assert.equal(kinoRow.scoreBreakdown.recentRecommendation, -48);
  const candidates = selectCandidates(pool, prefs, intent, { recentPlans, rejectedIds: [kino.id] });
  for (const venue of candidates) {
    const row = rows.find(row => row.id === venue.id);
    assert.equal(row.score, venue.score);
    assert.deepEqual(row.tags, venue.tags);
    assert.equal(row.rejection, null);
    assert.equal(row.shortlisted, true);
  }
});
