import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft } from '../src/data/preferences.js';
import { preferencesForPlan } from '../src/utils/interests.js';
import { recommendationVenuesForDate } from '../src/data/recommendationCatalog.js';
import { extractRequestedActivities, extractExcludedActivities, activityDescriptor, matchesRequestedActivity, recordRetailer } from '../src/engine/requestedActivity.js';
import { interpretPreferences, coversTag, mergeIntent } from '../src/engine/preferences.js';
import { selectCandidates, venueRejection } from '../src/engine/filtering.js';
import { closestExperience } from '../src/engine/alternatives.js';
import { optimiseExperience } from '../src/engine/generation.js';
import { demoMatrix } from '../src/utils/planner.js';
import { createGoogleProvider, openingHours, discoveryQueries } from '../server/google.js';
import { generate } from '../src/services/discovery.js';

const sentence = 'i want to also go to a vinyl store';
const prefs = { ...defaultDraft(), date: '2026-10-18', duration: 5, transport: 'Walking',
  preferences: ['Coffee shops', 'Bookshops'], selectedPreferences: ['Coffee shops', 'Bookshops'], notes: sentence };
const activity = { query: 'record store', role: 'shop', outdoor: false };
// Synthetic Places responses only. No names, prices, hours or reviews below are
// claimed as real venue facts; providers never make network requests in tests.
function place(extra = {}) {
  return { id: 'fixture-records', displayName: { text: 'Fixture Rare Records' },
    formattedAddress: '12 Fixture Street, Sydney NSW 2000', types: ['store'],
    location: { latitude: -33.873, longitude: 151.207 }, businessStatus: 'OPERATIONAL',
    regularOpeningHours: { periods: [{ open: { day: 0, hour: 9 }, close: { day: 0, hour: 18 } }] },
    priceLevel: 'PRICE_LEVEL_INEXPENSIVE', ...extra };
}
function googleFor(places, catalogue = recommendationVenuesForDate(prefs.date), failTarget = false) {
  const queries = [];
  const provider = createGoogleProvider('mock-only-key', async (_url, options) => {
    const body = JSON.parse(options.body);
    queries.push(body);
    const targeted = body.textQuery.startsWith('record store near');
    return targeted && failTarget ? Response.json({}, { status: 503 }) : Response.json({ places: targeted ? places : [] });
  }, { curated: () => catalogue });
  return { provider, queries };
}
function installProviders(t, provider, ai = false) {
  const debug = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = String(url).split('/api/')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    switch (endpoint) {
      case 'status': return Response.json({ venues: 'google', recommendations: ai ? 'openai' : 'planner' });
      case 'venues': {
        const result = await provider.discoverWithDebug(body.prefs);
        debug.push(result.debug);
        return Response.json(result);
      }
      case 'discovery': return Response.json({ venues: [], leads: [], researchStatus: 'sources' });
      case 'matrix': return Response.json({ matrix: demoMatrix(body.venues, body.prefs.transport) });
      case 'intent': return Response.json({ intent: interpretPreferences(body.prefs) });
      case 'recommendations': return Response.json({ rankings: body.venues.map(venue => ({
        venueId: venue.id, fit: 1, exclude: venue.id === 'fixture-records',
      })) });
      default: throw new Error(`Unexpected provider call: ${endpoint}`);
    }
  });
  return debug;
}
function feasible(plan, input) {
  assert.ok(plan);
  assert.ok(plan.cost <= input.budget);
  assert.ok(plan.elapsed <= input.duration * 60);
  assert.ok(plan.stops.some(stop => stop.id === 'fixture-records' && stop.activityRole === 'shop'));
  assert.ok(plan.stops.every(stop => !venueRejection(stop, input, plan.intent)));
  assert.ok(coversTag(plan.stops, 'record store'));
}

test('exact screenshot and conversational synonyms share the record-retail shop intent', () => {
  for (const text of [sentence, 'find a vinyl store', "I'd like to visit a record shop", 'I also want to browse vinyl records',
    'I would like to also go to some record stores', 'Please find a vinyl shop near Newtown', 'vinyl shops']) {
    assert.deepEqual(extractRequestedActivities(text), [activity], text);
    assert.deepEqual(interpretPreferences({ ...prefs, notes: text }).requiredActivities, [activity]);
  }
  assert.equal(activityDescriptor('record shops').query, 'record store');
  assert.equal(activityDescriptor('vinyl store').placeType, undefined);
  const intent = interpretPreferences(prefs);
  assert.ok(intent.requiredRoles.includes('shop'));
  assert.ok(intent.requiredTags.includes('record store'));
  assert.deepEqual(mergeIntent(intent, interpretPreferences({ ...prefs, notes: '' })).requiredActivities, [activity]);
  assert.equal(extractRequestedActivities('I want to go skateboarding')[0].query, 'skate park');
  assert.equal(extractRequestedActivities('I also want to visit indie bookshops')[0].query, 'independent bookshop');
  assert.equal(extractRequestedActivities('I would like to go to a photo booth')[0].query, 'photo booth');
});

test('record-retail evidence comes from identity/types or reviewed catalogue facts, never query tags', () => {
  assert.equal(recordRetailer({ source: 'google', name: 'Fixture Rare Records', providerTypes: ['store'] }), true);
  assert.equal(recordRetailer({ source: 'google', name: 'Fixture Record Shop', providerTypes: ['establishment', 'point_of_interest'] }), true);
  assert.equal(recordRetailer({ source: 'google', name: 'Fixture Record Store' }), true);
  for (const venue of [
    { source: 'google', name: 'Fixture General Shop', providerTypes: ['store'], tags: ['record store'] },
    { source: 'google', name: 'Fixture Photography Studio', providerTypes: ['store'] },
    { source: 'google', name: 'Fixture Records', providerTypes: ['consultant'] },
    { source: 'google', name: 'Fixture Recording Studio', providerTypes: ['store'] },
    { source: 'google', name: 'Fixture Vinyl Flooring', providerTypes: ['store'] },
    recommendationVenuesForDate(prefs.date).find(venue => venue.id === 'pick-caterpillar-club'),
  ]) assert.equal(matchesRequestedActivity(venue, activity), false, venue.name);
  assert.equal(recordRetailer({ source: 'curated', name: 'Fixture Pressings', roles: ['shop'], category: 'Vinyl shop', tags: [] }), true);
});

test('catalogue search comes first, and only one clean bounded targeted query is used when needed', async () => {
  const { provider, queries } = googleFor([place()]);
  const result = await provider.discoverWithDebug(prefs);
  const targeted = queries.filter(query => query.textQuery.startsWith('record store near'));
  assert.equal(targeted.length, 1);
  assert.equal(queries.length, discoveryQueries(prefs.preferences).length + 1);
  assert.equal(targeted[0].textQuery, 'record store near Sydney CBD, Sydney Australia');
  assert.equal(targeted[0].includedType, undefined);
  assert.equal(targeted[0].strictTypeFiltering, undefined);
  assert.equal(targeted[0].pageSize, 6);
  assert.equal(targeted[0].pageToken, undefined);
  assert.deepEqual(result.venues[0].roles, ['shop']);
  const curated = { ...result.venues[0], id: 'fixture-curated', source: 'curated', category: 'Record shop' };
  const local = googleFor([], [curated]);
  const localResult = await local.provider.discoverWithDebug(prefs);
  assert.equal(localResult.debug.curatedActivityMatches, 1);
  assert.equal(localResult.debug.targetedQueries, 0);
  assert.ok(local.queries.every(query => !query.textQuery.startsWith('record store near')));
  const closed = { ...curated, weeklyHours: openingHours([{ open: { day: 0, hour: 19 }, close: { day: 0, hour: 20 } }]) };
  assert.equal((await googleFor([], [closed]).provider.discoverWithDebug(prefs)).debug.targetedQueries, 1);
});

test('Google validates real record-retail identities and rejects generic/service/unverified results', async () => {
  const { provider } = googleFor([place(),
    place({ id: 'generic', displayName: { text: 'Fixture General Shop' } }),
    place({ id: 'service', displayName: { text: 'Fixture Photography Studio' }, types: ['photography_service'] }),
    place({ id: 'unknown', regularOpeningHours: undefined }),
    place({ id: 'closed', businessStatus: 'CLOSED_TEMPORARILY' }),
  ]);
  const { venues, debug } = await provider.discoverWithDebug(prefs);
  assert.deepEqual(venues.map(venue => venue.id), ['fixture-records']);
  assert.equal(debug.googleResults, 5);
  assert.equal(debug.targetedResults, 5);
  assert.deepEqual(debug.rejectedReasons, { 'activity-mismatch': 1, 'service-business': 1, 'unknown-hours': 1, 'not-operational': 1 });
});

for (const ai of [false, true]) test(`full onboarding notes → Places → shortlist → feasible itinerary preserves the required record shop (${ai ? 'mock AI' : 'planner'})`, async t => {
  const { provider, queries } = googleFor([place(), place({ id: 'generic', displayName: { text: 'Fixture General Shop' } }),
    place({ id: 'service', displayName: { text: 'Fixture Photography Studio' }, types: ['photography_service'] })]);
  const debug = installProviders(t, provider, ai);
  const draft = { ...prefs, notes: sentence };
  const input = { ...draft, preferences: preferencesForPlan(draft) };
  const result = await generate(input);
  feasible(result.plan, input);
  assert.ok(result.plan.stops.some(stop => stop.activityRole === 'cafe'));
  assert.ok(result.plan.stops.some(stop => stop.activityRole === 'bookshop'));
  assert.ok(result.plan.elapsed < 300); // Availability is a ceiling, never fill time.
  assert.ok(!result.plan.adjustments?.some(adjustment => adjustment.requested === 'record store'));
  assert.equal(debug[0].targetedQueries, 1);
  console.log('SYNTHETIC VINYL ONBOARDING', JSON.stringify({ intent: extractRequestedActivities(sentence),
    requiredActivities: result.plan.intent.requiredActivities,
    exactTargetedQuery: queries.find(query => query.textQuery.startsWith('record store near')).textQuery,
    googleResults: debug[0].googleResults, googleCandidates: debug[0].googleCandidates,
    rejections: debug[0].rejections, chosenStops: result.plan.stops.map(stop => ({ name: stop.name, role: stop.activityRole })),
    elapsedMinutes: result.plan.elapsed, availableMinutes: input.duration * 60,
  }, null, 2));
});

test('older or cached API activity labels cannot make a generic shop satisfy the mandatory request', async t => {
  const venue = (await googleFor([place()]).provider.discover(prefs))[0];
  installProviders(t, { discoverWithDebug: async () => ({ venues: [{ ...venue, name: 'Fixture General Shop' }], debug: {} }) });
  const result = await generate(prefs);
  assert.equal(result.plan, null);
  assert.match(result.failure.message, /did not return a verified record retailer/);
});

test('a 2.5-hour compatible route cannot silently omit a feasible required stop in shortlist or fallback', async () => {
  const record = (await googleFor([place()]).provider.discover(prefs))[0];
  const catalog = ['cafe', 'bookshop', 'dessert'].map((role, index) => ({ ...record, id: `fixture-${role}`,
    name: `Fixture ${role}`, category: { cafe: 'Coffee shops', bookshop: 'Bookshops', dessert: 'Desserts' }[role],
    tags: [{ cafe: 'Coffee shops', bookshop: 'Bookshops', dessert: 'Desserts' }[role]], roles: [role],
    source: 'curated', cost: 10, mins: 50, lat: record.lat, lng: record.lng, address: `${index + 1} Fixture Street, Sydney NSW 2000`,
  }));
  const plain = { ...prefs, notes: '' };
  const baseline = selectCandidates(catalog, plain, interpretPreferences(plain));
  const before = optimiseExperience(baseline, plain, demoMatrix(baseline, 'Walking'), interpretPreferences(plain));
  assert.equal(before.elapsed, 150);
  const intent = interpretPreferences(prefs);
  const candidates = selectCandidates([...catalog, record], prefs, intent);
  const matrix = demoMatrix(candidates, 'Walking');
  feasible(optimiseExperience(candidates, prefs, matrix, intent), prefs);
  feasible(closestExperience(candidates, prefs, matrix, intent), prefs);
  assert.equal(closestExperience(baseline, prefs, demoMatrix(baseline, 'Walking'), intent), null);
});

for (const [label, response, overrides, expected] of [
  ['not found', [], {}, /did not return a verified record retailer/],
  ['closed', [place({ businessStatus: 'CLOSED_TEMPORARILY' })], {}, /closed/],
  ['hours unverified', [place({ regularOpeningHours: undefined })], {}, /opening hours unverified/],
  ['outside area', [place({ location: { latitude: -33.99, longitude: 151.05 } })], {}, /outside the selected area/],
  ['budget', [place({ priceLevel: 'PRICE_LEVEL_EXPENSIVE' })], { budget: 20 }, /above the selected budget/],
  ['time', [place({ regularOpeningHours: { periods: [{ open: { day: 0, hour: 19 }, close: { day: 0, hour: 20 } }] } })], {}, /opening window that fits/],
]) test(`unavailable record stop (${label}) yields an honest failure instead of an unrelated route`, async t => {
  const { provider } = googleFor(response);
  installProviders(t, provider);
  const result = await generate({ ...prefs, ...overrides });
  assert.equal(result.plan, null);
  assert.match(result.failure.message, expected);
});

test('failed target search is reported without a retry or an unrelated itinerary', async t => {
  const { provider, queries } = googleFor([], undefined, true);
  installProviders(t, provider);
  const result = await generate(prefs);
  assert.equal(result.plan, null);
  assert.match(result.failure.message, /requested place search is unavailable/);
  assert.equal(queries.filter(query => query.textQuery.startsWith('record store near')).length, 1);
});

test('negated retail requests stay excluded even from ordinary Shopping searches', async () => {
  for (const notes of ["I don't want a record shop", 'no vinyl stores', 'avoid record stores']) {
    assert.deepEqual(extractRequestedActivities(notes), []);
    assert.deepEqual(extractExcludedActivities(notes), [activity]);
    const input = { ...prefs, preferences: ['Shopping'], notes };
    const intent = interpretPreferences(input);
    assert.deepEqual(intent.requiredActivities, []);
    const provider = createGoogleProvider('mock-only-key', async () => Response.json({ places: [place()] }));
    const result = await provider.discoverWithDebug(input);
    assert.deepEqual(result.venues, []);
    assert.equal(result.debug.targetedQueries, 0);
    assert.equal(result.debug.rejectedReasons.preference, 1);
  }
});
