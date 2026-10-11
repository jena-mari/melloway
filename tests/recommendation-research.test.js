import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationResearchProvider, groundedLeads, researchInput } from '../server/recommendationResearch.js';
import { createGoogleProvider } from '../server/google.js';
import { createApiServer } from '../server/index.js';
import { recommendationInput } from '../server/openai.js';
import { attachRecommendationEvidence, cleanEvidence, evidenceScore, eventServiceOnly } from '../src/engine/recommendationEvidence.js';
import { recommendationSourceUrls } from '../src/data/recommendationSources.js';
import { curatedVenuesForDate } from '../src/data/sydneyVenues.js';
import { defaultDraft } from '../src/data/preferences.js';
import { scoreVenue } from '../src/engine/scoring.js';
import { interpretPreferences } from '../src/engine/preferences.js';
import { selectCandidates, venueRejection } from '../src/engine/filtering.js';
import { generate, prepareAdditions, prepareBrowse } from '../src/services/discovery.js';
import { demoMatrix } from '../src/utils/planner.js';
const prefs = { ...defaultDraft(), date: '2026-10-18', area: 'Surry Hills', transport: 'Walking', preferences: ['Coffee shops'], budget: 100 };
const source = recommendationSourceUrls[0];
const post = 'https://www.instagram.com/reel/RealPost123/';
const tiktok = 'https://www.tiktok.com/@visitor/video/7341234567890123456';
const evidence = (url = source, overrides = {}) => ({ url, summary: 'Visitor café recommendation.', sentiment: 'positive', origin: 'independent', matchesVenue: true, publishedAt: '2026-09-01', ...overrides });
const lead = (overrides = {}) => ({ name: 'Reuben Hills', locality: 'Surry Hills', tags: ['Coffee shops'], matchesSydney: true, evidence: [evidence()], ...overrides });
const response = (leads = [lead()], sources = [source]) => ({ status: 'completed', output: [
  { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: sources.map(url => ({ url })) } },
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ leads }) }] },
] });
const catalog = curatedVenuesForDate(prefs.date);
const reuben = catalog.find(v => v.name === 'Reuben Hills');

test('research accepts only actual retrieved sources and exact venue confirmation; no manufactured social URLs', () => {
  const leads = groundedLeads(response([lead({ evidence: [evidence(source), evidence(post), evidence(tiktok), evidence('https://www.instagram.com/reel/Fabricated123/'), evidence('https://www.instagram.com/explore/'), evidence('http://localhost/private'), evidence(recommendationSourceUrls[1], { matchesVenue: false })] })], [source, post, tiktok, recommendationSourceUrls[1]]));
  assert.equal(leads.length, 1);
  assert.deepEqual(leads[0].evidence.map(e => e.kind), ['editorial', 'social', 'social']);
  assert.equal(groundedLeads(response([lead({ matchesSydney: false })])).length, 0);
  assert.equal(groundedLeads({ ...response(), status: 'incomplete' }).length, 0);
  assert.equal(groundedLeads({ status: 'completed', output: response().output.slice(1) }).length, 0);
  assert.equal(groundedLeads(response([lead()], [])).length, 0);
});

test('web research uses the configured model, structured output and minimal preferences; caches and coalesces requests', async () => {
  let calls = 0, request, clock = Date.parse('2026-10-11');
  const provider = createRecommendationResearchProvider('MOCK_SECRET', 'gpt-4.1-mini', async (_url, options) => {
    calls++; request = JSON.parse(options.body); await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(response());
  }, () => clock);
  const privatePrefs = { ...prefs, name: 'PRIVATE_NAME', age: 25, partner: 'PRIVATE_PARTNER', location: { lat: -33.8, lng: 151.2 } };
  const values = await Promise.all([provider.discover(privatePrefs), provider.discover(privatePrefs)]);
  assert.deepEqual(values[0], values[1]); assert.equal(calls, 1);
  assert.equal(request.model, 'gpt-4.1-mini'); assert.equal(request.tool_choice, 'required'); assert.equal(request.store, false);
  assert.equal(request.max_tool_calls, 5); assert.equal(request.text.format.strict, true); assert.ok(request.include.includes('web_search_call.action.sources'));
  assert.match(request.instructions, /TikTok.*Instagram/); assert.match(request.instructions, /not Google Maps alone/);
  assert.doesNotMatch(JSON.stringify(researchInput(privatePrefs)), /PRIVATE_NAME|PRIVATE_PARTNER|MOCK_SECRET|"lat"|"age"/);
  await provider.discover(privatePrefs); assert.equal(calls, 1);
  await provider.discover({ ...privatePrefs, notes: 'quiet café' }); assert.equal(calls, 2);
  clock += 7 * 3600000; await provider.discover(privatePrefs); assert.equal(calls, 3);
});

test('empty research expires sooner; errors and unsearched answers are not cached as successful evidence', async () => {
  let calls = 0, clock = Date.parse('2026-10-11');
  const provider = createRecommendationResearchProvider('mock', undefined, async () => { calls++; return Response.json(response([])); }, () => clock);
  await provider.discover(prefs); await provider.discover(prefs); assert.equal(calls, 1);
  clock += 16 * 60000; await provider.discover(prefs); assert.equal(calls, 2);
  const invalid = createRecommendationResearchProvider('mock', undefined, async () => Response.json({ status: 'completed', output: response().output.slice(1) }));
  await assert.rejects(invalid.discover(prefs), /did not search/);
});

test('evidence belongs to the exact branch and never overwrites operator facts', () => {
  const enriched = attachRecommendationEvidence([reuben], [lead()])[0];
  for (const key of ['name', 'address', 'weeklyHours', 'cost', 'lat', 'lng', 'tags']) assert.deepEqual(enriched[key], reuben[key]);
  assert.equal(enriched.recommendationEvidence.length, 1);
  const otherBranch = { ...reuben, address: '1 Test Street, Manly NSW 2095' };
  assert.equal(attachRecommendationEvidence([otherBranch], [lead()])[0].recommendationEvidence, undefined);
  const nearbyBranch = { ...reuben, id: 'same-suburb-branch', address: '1 Test Street, Surry Hills NSW 2010' };
  assert.ok(attachRecommendationEvidence([reuben, nearbyBranch], [lead()]).every(v => !v.recommendationEvidence));
  const ai = recommendationInput(prefs, [enriched]).places[0];
  assert.equal(ai.recommendationEvidence[0].url, source);
});

test('independent corroboration matters more than Google rating; duplicate pages, old posts and paid promotions cannot dominate', () => {
  const input = [evidence(), evidence(recommendationSourceUrls[1])];
  const supported = { ...reuben, recommendationEvidence: input };
  const unsupported = { ...reuben, rating: 5, source: 'google' };
  const intent = interpretPreferences(prefs);
  assert.ok(scoreVenue(supported, prefs, intent).score > scoreVenue(unsupported, prefs, intent).score);
  assert.equal(evidenceScore(supported, prefs.date), 1);
  const duplicated = { ...reuben, recommendationEvidence: Array.from({ length: 8 }, (_, i) => evidence(`https://www.russh.com/cafe-story-${i}/`)) };
  assert.equal(evidenceScore(duplicated, prefs.date), 0.5);
  assert.ok(evidenceScore({ ...reuben, recommendationEvidence: [evidence(post)] }, prefs.date) > evidenceScore({ ...reuben, recommendationEvidence: [evidence(post, { origin: 'sponsored' })] }, prefs.date));
  assert.ok(evidenceScore({ ...reuben, recommendationEvidence: [evidence()] }, prefs.date) > evidenceScore({ ...reuben, recommendationEvidence: [evidence(source, { publishedAt: '2015-01-01' })] }, prefs.date));
  assert.equal(evidenceScore({ ...reuben, recommendationEvidence: [evidence(source, { publishedAt: '2099-01-01' })] }, prefs.date), 0);
  assert.equal(cleanEvidence([evidence(), evidence(source, { sentiment: 'mixed' })])[0].sentiment, 'mixed');
  assert.ok(evidenceScore({ ...reuben, recommendationEvidence: [evidence(source, { sentiment: 'negative' })] }, prefs.date) < 0);
});

test('source-backed scoring cannot override hours, budget or rental eligibility', () => {
  const enriched = { ...reuben, recommendationEvidence: [evidence(), evidence(recommendationSourceUrls[1])] };
  const intent = interpretPreferences(prefs);
  assert.equal(venueRejection({ ...enriched, weeklyHours: Array.from({ length: 7 }, () => []) }, prefs, intent), 'hours');
  assert.equal(venueRejection({ ...enriched, cost: 150 }, prefs, intent), 'budget');
  for (const venue of [
    { ...enriched, name: 'Photo booth hire', tags: ['Photo booths'] },
    { ...enriched, name: 'Fyre Photo Booths', website: 'https://www.fyreevents.com.au/' },
    { ...enriched, visitMode: 'event-service' },
    { ...enriched, pureServiceAreaBusiness: true },
  ]) assert.equal(venueRejection(venue, prefs, intent), 'event-service');
  assert.equal(eventServiceOnly({ name: 'Walk-in Studio', tags: ['Photo booths'], website: 'https://studio.example/the-studio' }), false);
});

const googlePlace = (name, overrides = {}) => ({ id: name, displayName: { text: name }, formattedAddress: '61 Albion Street, Surry Hills NSW 2010', location: { latitude: reuben.lat, longitude: reuben.lng }, businessStatus: 'OPERATIONAL', regularOpeningHours: { periods: [{ open: { day: 0, hour: 0 } }] }, ...overrides });
test('Google resolves named source leads, rejects wrong branches/rental services and preserves partial discovery', async () => {
  let calls = 0, request;
  const provider = createGoogleProvider('mock', async (_url, options) => {
    calls++; request = JSON.parse(options.body);
    assert.match(options.headers['X-Goog-FieldMask'], /websiteUri/);
    return Response.json({ places: [googlePlace('Reuben Hills'), googlePlace('Other café'), googlePlace('Reuben Hills', { formattedAddress: '1 Main Road, Manly NSW 2095' })] });
  });
  const venues = await provider.resolveResearch(prefs, [lead()]);
  assert.equal(venues.length, 1); assert.equal(venues[0].name, 'Reuben Hills');
  assert.match(request.textQuery, /Reuben Hills, Surry Hills/); assert.equal(venues[0].recommendationEvidence.length, 1);
  await provider.resolveResearch(prefs, [lead()]); assert.equal(calls, 1);
  const ambiguous = createGoogleProvider('mock', async () => Response.json({ places: [googlePlace('Reuben Hills'), googlePlace('Reuben Hills', { id: 'other-branch', formattedAddress: '1 Test Street, Surry Hills NSW 2010' })] }));
  assert.deepEqual(await ambiguous.resolveResearch(prefs, [lead()]), []);
  const rentals = createGoogleProvider('mock', async () => Response.json({ places: [googlePlace('Fyre Photo Booths', { websiteUri: 'https://fyreevents.com.au/' }), googlePlace('Rental Co', { pureServiceAreaBusiness: true })] }));
  assert.deepEqual(await rentals.discover({ ...prefs, preferences: ['Photo booths'] }), []);
  let partial = 0;
  const resilient = createGoogleProvider('mock', async () => ++partial === 1 ? Response.json({}, { status: 502 }) : Response.json({ places: [googlePlace('Reuben Hills')] }));
  assert.ok((await resilient.discover({ ...prefs, preferences: ['Coffee shops', 'Art galleries'] })).length);
});

async function withApi(options, run) {
  const server = createApiServer({ env: {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(async body => { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/discovery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, data: await res.json() }; }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('new discovery endpoint works without Google, keeps existing contracts and falls back on search failure', async () => {
  await withApi({ env: { OPENAI_API_KEY: 'mock' }, researchProvider: { discover: async () => [lead()] } }, async request => {
    const result = await request({ prefs }); assert.equal(result.status, 200); assert.equal(result.data.researchStatus, 'web'); assert.deepEqual(result.data.venues, []);
    assert.ok(result.data.leads.some(lead => lead.name === 'Reuben Hills'));
    assert.equal((await request({ prefs: {} })).status, 400);
  });
  await withApi({ env: { OPENAI_API_KEY: 'mock' }, researchProvider: { discover: async () => { throw new Error('Provider unavailable'); } } }, async request => {
    const result = await request({ prefs }); assert.equal(result.data.researchStatus, 'unavailable'); assert.ok(result.data.leads.length);
  });
  await withApi({ env: { OPENAI_API_KEY: 'mock', OPENAI_RECOMMENDATION_RESEARCH: 'false' }, researchProvider: { discover: async () => assert.fail('Disabled research') } }, async request => assert.equal((await request({ prefs })).data.researchStatus, 'sources'));
});

test('source-guided discovery covers each requested activity before spending its six-place lookup budget', async () => {
  let targeted;
  const leads = [lead(), lead({ name: 'New Walk-in Studio', locality: 'Sydney', tags: ['Photo booths'] }), lead({ name: 'Rental Co', tags: ['Photo booths'], visitMode: 'event-service' })];
  await withApi({ env: { OPENAI_API_KEY: 'mock', GOOGLE_MAPS_API_KEY: 'mock' }, researchProvider: { discover: async () => leads }, googleProvider: { resolveResearch: async (_prefs, input) => { targeted = input; return []; } } }, async request => {
    const result = await request({ prefs: { ...prefs, preferences: ['Coffee shops', 'Photo booths', 'Art galleries'] } });
    assert.equal(result.status, 200); assert.ok(targeted.length <= 6);
    assert.ok(targeted.some(lead => lead.tags.includes('Photo booths')));
    assert.ok(targeted.some(lead => lead.tags.includes('Art galleries')));
    assert.ok(!targeted.some(lead => lead.visitMode === 'event-service'));
  });
});

function mockClient(t, research) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const endpoint = String(url).split('/api/')[1], body = options.body ? JSON.parse(options.body) : {};
    requests.push({ endpoint, body });
    if (endpoint === 'status') return Response.json({ venues: 'curated', recommendations: 'openai' });
    if (endpoint === 'discovery') return research();
    if (endpoint === 'intent') return Response.json({ intent: interpretPreferences(body.prefs) });
    if (endpoint === 'recommendations') return Response.json({ rankings: body.venues.map(v => ({ venueId: v.id, fit: 8, exclude: false })) });
    if (endpoint === 'matrix') return Response.json({ matrix: demoMatrix(body.venues, body.prefs.transport) });
    assert.fail(`Unexpected offline endpoint ${endpoint}`);
  }); return requests;
}
test('actual generation discovers a new source-backed place BEFORE shortlisting and passes its evidence to ranking', async t => {
  const newVenue = { ...reuben, id: 'new-source-cafe', name: 'New Café', source: 'google', address: '2 Test Street, Surry Hills NSW 2010' };
  const newLead = lead({ name: 'New Café', evidence: [evidence(post)] });
  const requests = mockClient(t, () => Response.json({ leads: [newLead], venues: [newVenue], researchStatus: 'web' }));
  const result = await generate(prefs);
  assert.ok(result.plan); assert.equal(result.plan.discoverySource, 'web');
  const candidate = requests.find(r => r.endpoint === 'recommendations').body.venues.find(v => v.id === newVenue.id);
  assert.ok(candidate); assert.equal(candidate.recommendationEvidence[0].url, post);
  assert.ok(requests.some(r => r.endpoint === 'matrix')); assert.ok(result.plan.cost <= prefs.budget);
  assert.ok(!result.plan.stops.some(v => v.source === 'demo'));
});
test('Explore and additions research curated routes too, without reintroducing old rental candidates', async t => {
  const requests = mockClient(t, () => Response.json({ leads: [], venues: [], researchStatus: 'sources' }));
  const browse = await prepareBrowse({ ...prefs, date: "", time: "" }); assert.equal(browse.candidates.length, catalog.length);
  assert.ok(browse.candidates.some(v => v.name === "Mapo Newtown"));
  const rental = { ...reuben, id: 'rental', name: 'Photo booth hire', tags: ['Photo booths'] };
  const plan = { stops: [reuben], prefs, intent: interpretPreferences(prefs) };
  const extras = await prepareAdditions(plan, [rental]);
  assert.equal(extras.candidates[0].id, reuben.id);
  assert.ok(!extras.candidates.some(v => v.id === 'rental'));
  assert.ok(requests.filter(r => r.endpoint === 'discovery').length >= 2);
});
test('failed research still returns a sourced, constraint-checked outing', async t => {
  mockClient(t, () => Response.json({ error: 'Offline provider failure' }, { status: 502 }));
  const result = await generate(prefs); assert.ok(result.plan);
  assert.ok(result.candidates.every(v => v.source === 'curated'));
  assert.ok(result.candidates.some(v => v.recommendationEvidence?.length));
  assert.ok(result.plan.elapsed <= prefs.duration * 60);
  assert.match(result.plan.notice, /Web research unavailable/);
});
