import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleProvider, discoveryQueries, openingHours } from "../server/google.js";
import { createApiServer } from "../server/index.js";
import { defaultDraft } from "../src/data/preferences.js";
import { extractRequestedActivity, matchesRequestedActivity } from "../src/engine/requestedActivity.js";
import { interpretPreferences, coversTag, mergeIntent } from "../src/engine/preferences.js";
import { scoreVenue } from "../src/engine/scoring.js";
import { selectCandidates, venueRejection } from "../src/engine/filtering.js";
import { optimiseExperience } from "../src/engine/generation.js";
import { demoMatrix, schedule } from "../src/utils/planner.js";
import { prepareBrowse, generate } from "../src/services/discovery.js";

// Synthetic fixtures only: none of these names, IDs, prices or hours are live facts.
const prefs = { ...defaultDraft(), date: "2026-10-18", notes: "I want a skate park", preferences: ["Coffee shops"], time: "11:00" };
const allHours = [{ open: { day: 0, hour: 0, minute: 0 } }];
function place(overrides = {}) {
  return { id: "fixture-skate", displayName: { text: "Fixture Skate Park" },
    formattedAddress: "Fixture Street, Sydney NSW", location: { latitude: -33.873, longitude: 151.207 },
    businessStatus: "OPERATIONAL", types: ["skateboard_park"], priceLevel: "PRICE_LEVEL_INEXPENSIVE",
    regularOpeningHours: { periods: allHours }, ...overrides };
}
function cafe(id = "fixture-cafe", source = "curated") {
  return { id, name: "Fixture Coffee", address: "Fixture Street, Sydney NSW", source,
    category: "Coffee shops", tags: ["Coffee shops"], roles: ["cafe"],
    lat: -33.873, lng: 151.207, area: "Sydney CBD", cost: 15, mins: 45, rating: 5,
    weeklyHours: openingHours(allHours), hoursStatus: "published" };
}
function providerFor(targetPlaces, curated = [cafe()], normalPlaces = [], admissionEvidence) {
  const requests = [];
  const provider = createGoogleProvider("mock-only-key", async (_url, options) => {
    const body = JSON.parse(options.body); requests.push({ body, mask: options.headers["X-Goog-FieldMask"] });
    return Response.json({ places: body.textQuery.startsWith("skate park") ? targetPlaces : normalPlaces });
  }, { curated: () => curated, ...(admissionEvidence ? { admissionEvidence } : {}) });
  return { provider, requests };
}

test("specific affirmative activities use open vocabulary, with negations and general notes ignored", () => {
  for (const [text, expected] of [["I want a skate park", "skate park"], ["I want to go skateboarding", "skate park"], ["Looking for a bouldering gym near Newtown", "bouldering gym"],
    ["I'd like a pottery studio", "pottery studio"], ["skatepark", "skate park"], ["Find a basketball court please", "basketball court"]]) {
    assert.equal(extractRequestedActivity(text)?.query, expected);
  }
  for (const text of ["I don't want a skate park", "no skate parks", "I want something fun", "romantic evening", "Include Fixture Coffee, Fixture Street."]) {
    assert.equal(extractRequestedActivity(text), null, text);
  }
  const intent = interpretPreferences(prefs);
  assert.ok(intent.requiredTags.includes("skate park"));
  assert.ok(intent.requiredRoles.includes("activity"));
  assert.deepEqual(intent.interests, ["Coffee shops"]); // Existing API tag contract unchanged.
  const merged = mergeIntent(intent, { ...intent, requiredRoles: ["cafe"] });
  assert.equal(merged.requestedActivity.query, "skate park");
  assert.ok(merged.requiredTags.includes("skate park"));
});

test("one additional targeted query preserves normal category searches and ignores pagination", async () => {
  const input = { ...prefs, preferences: ["Coffee shops", "Bookshops", "Italian food", "Museums"] };
  const { provider, requests } = providerFor([place()], [cafe()], [place({ id: "fixture-normal", displayName: { text: "Fixture Coffee" }, types: ["cafe"] })]);
  const { venues, debug } = await provider.discoverWithDebug(input);
  assert.equal(requests.length, discoveryQueries(input.preferences).length + 1);
  const targeted = requests.filter(r => r.body.includedType === "skateboard_park");
  assert.equal(targeted.length, 1);
  assert.equal(targeted[0].body.strictTypeFiltering, true);
  assert.equal(targeted[0].body.pageSize, 6);
  assert.equal(targeted[0].body.pageToken, undefined);
  assert.ok(targeted[0].mask.includes("places.priceLevel"));
  assert.ok(venues.some(v => v.id === "fixture-normal"));
  assert.ok(venues.some(v => v.id === "fixture-skate"));
  assert.equal(debug.targetedQueries, 1);
  assert.equal(debug.curatedCandidates, 1);
  assert.equal(debug.googleCandidates, 2);
  assert.equal(debug.rejectedReasons['category-mismatch'], 3);
  assert.equal(debug.rejectedReasons.duplicate, undefined);
});

test("an eligible curated activity satisfies the request, including categories outside existing tags", async () => {
  const skate = { ...cafe("fixture-curated-skate"), name: "Fixture Skate Park", category: "Skate park", tags: ["Outdoor"], roles: ["activity"], cost: 0 };
  const { provider, requests } = providerFor([], [skate, cafe()]);
  const result = await provider.discoverWithDebug(prefs);
  assert.equal(result.debug.targetedQueries, 0);
  assert.equal(result.debug.curatedActivityMatches, 1);
  assert.equal(requests.length, 1);
  assert.ok(coversTag([skate], "skate park"));
  for (const unsuitable of [{ ...skate, cost: 150 }, { ...skate, lat: -33.99 }, { ...skate, weeklyHours: null },
    { ...skate, weeklyHours: openingHours([{ open: { day: 0, hour: 19 }, close: { day: 0, hour: 20 } }]) }]) {
    assert.equal((await providerFor([], [unsuitable]).provider.discoverWithDebug(prefs)).debug.targetedQueries, 1);
  }
});

test("actual provider identity and location, not the query label, determine activity matches", async () => {
  const invalid = [place({ id: "cafe", displayName: { text: "Skate Park Café" }, types: ["cafe"] }),
    place({ id: "missing-name", displayName: {} }), place({ id: "", displayName: { text: "Fixture Skate Park" } }),
    place({ id: "no-address", formattedAddress: "" }), place({ id: "no-location", location: null }),
    place({ id: "far-away", location: { latitude: -33.95, longitude: 151.1 } }),
    place({ id: "closed", businessStatus: "CLOSED_PERMANENTLY" }), place({ id: "mobile-service", pureServiceAreaBusiness: true })];
  const result = await providerFor(invalid).provider.discoverWithDebug(prefs);
  assert.deepEqual(result.venues, []);
  assert.equal(result.debug.rejectedResults, invalid.length);
  assert.deepEqual(result.debug.rejectedReasons, { "activity-mismatch": 1, identity: 3, location: 2, "not-operational": 1, "event-service": 1 });
  assert.equal(matchesRequestedActivity({ ...cafe(), source: "google", category: "skate park", tags: ["skate park"] }, extractRequestedActivity(prefs.notes)), false);
});

test("price allowances respect total and activity budgets without treating unknown prices as free", async () => {
  const { provider } = providerFor([place({ id: "expensive", priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" }),
    place({ id: "unknown-price", priceLevel: undefined }), place({ id: "bad-price", priceLevel: "CHEAP" })]);
  const result = await provider.discoverWithDebug(prefs);
  assert.deepEqual(result.venues.map(v => v.id), ["unknown-price"]);
  assert.equal(result.venues[0].cost, 20);
  assert.equal(result.venues[0].priceStatus, "unknown");
  assert.equal(result.venues[0].costLabel, "price unconfirmed · $20 planning allowance");
  assert.equal(result.venues[0].priceLevel, null);
  assert.match(result.venues[0].note, /not a venue quote/);
  assert.deepEqual(result.debug.rejectedReasons, { budget: 1, "invalid-price": 1 });
  assert.deepEqual((await provider.discoverWithDebug({ ...prefs, activityBudgets: { activities: 0 } })).venues, []);
  assert.deepEqual((await provider.discoverWithDebug({ ...prefs, budget: 0 })).venues, []);
  assert.equal((await providerFor([place({ priceLevel: "PRICE_LEVEL_FREE" })]).provider.discoverWithDebug({ ...prefs, budget: 0 })).venues[0].cost, 0);
});

test("verified free admission stays zero despite missing outdoor types and custom activity money", async () => {
  const evidence = { url: 'https://example.com/council/fixture-park', checkedAt: '2026-10-12', fields: ['free admission'] };
  const park = place({ priceLevel: undefined, types: ['sports_complex'] });
  const provider = providerFor([park], [], [], p => p.id === park.id ? evidence : null).provider;
  const result = await provider.discoverWithDebug({ ...prefs, budget: 0, preferences: [] });
  assert.equal(result.venues.length, 1);
  assert.equal(result.venues[0].cost, 0);
  assert.equal(result.venues[0].priceStatus, 'free');
  assert.equal(result.venues[0].costLabel, 'free entry · $0');
  assert.deepEqual(result.venues[0].priceEvidence, evidence);
  const allocated = schedule(result.venues, { ...prefs, activityBudgets: { activities: 35 } }, [[{ minutes: 0, distance: 0 }]], [0]);
  assert.ok(allocated);
  assert.equal(allocated.stops[0].cost, 0);
  assert.equal(allocated.cost, 0);
  assert.equal(allocated.budgetBreakdown.activities.allowance, 35);
  // A fee reported by Google takes precedence over a previously checked source.
  const paid = await providerFor([place({ priceLevel: 'PRICE_LEVEL_MODERATE' })], [], [], () => evidence).provider.discover(prefs);
  assert.equal(paid[0].cost, 45);
  assert.equal(paid[0].priceStatus, 'estimate');
  assert.equal(paid[0].priceEvidence, undefined);
});

test("free admission never invents hours and duplicate fallbacks cannot inflate its cost", async () => {
  const free = place({ priceLevel: 'PRICE_LEVEL_FREE' });
  const unknown = place({ priceLevel: undefined });
  const venues = await providerFor([free], [], [unknown]).provider.discover(prefs);
  assert.equal(venues.length, 1);
  assert.equal(venues[0].cost, 0);
  assert.equal(venues[0].priceStatus, 'free');
  const noHours = await providerFor([place({ priceLevel: 'PRICE_LEVEL_FREE', regularOpeningHours: undefined })]).provider.discover(prefs);
  assert.equal(noHours[0].hoursStatus, 'unverified');
  assert.equal(venueRejection(noHours[0], prefs, interpretPreferences(prefs)), 'unknown-hours');
  assert.equal(schedule(noHours, prefs, demoMatrix(noHours, prefs.transport), [0]), null);
});

test("contradictory provider prices stay unconfirmed rather than promising free entry", async () => {
  const venues = await providerFor([place({ priceLevel: 'PRICE_LEVEL_FREE' })], [],
    [place({ priceLevel: 'PRICE_LEVEL_MODERATE' })]).provider.discover(prefs);
  assert.equal(venues[0].cost, 45);
  assert.equal(venues[0].priceStatus, 'unknown');
  assert.equal(venues[0].priceLevel, null);
  assert.match(venues[0].costLabel, /price unconfirmed/);
  assert.match(venues[0].note, /results disagree/);
});

test("unknown outdoor hours are unverified suggestions and can never enter a confirmed schedule", async () => {
  const { venues, debug } = await providerFor([place({ regularOpeningHours: undefined })]).provider.discoverWithDebug(prefs);
  assert.equal(venues.length, 1);
  assert.equal(venues[0].hoursStatus, "unverified");
  assert.match(venues[0].note, /cannot be scheduled as confirmed open/);
  assert.equal(debug.unverifiedSuggestions, 1);
  const intent = interpretPreferences(prefs);
  assert.equal(venueRejection(venues[0], prefs, intent), "unknown-hours");
  assert.equal(schedule(venues, prefs, demoMatrix(venues, prefs.transport), [0]), null);
  assert.deepEqual(selectCandidates(venues, prefs, intent), []);
  assert.equal(optimiseExperience(venues, prefs, demoMatrix(venues, prefs.transport), intent), null);
});

test("indoor unknown hours and malformed periods cannot be promoted to confirmed open", async () => {
  for (const periods of [[{ open: { day: 0, hour: -1 }, close: { day: 0, hour: 25 } }],
    [{ open: { day: 0, hour: 9 }, close: { day: 8, hour: 10 } }], [null], [], "invalid"]) {
    assert.ok(openingHours(periods).every(day => !day.length));
  }
  const result = await providerFor([place({ displayName: { text: "Fixture Indoor Skate Park" },
    regularOpeningHours: { periods: [{ open: { day: 0, hour: 9 } }] } })]).provider.discoverWithDebug(prefs);
  assert.deepEqual(result.venues, []);
  assert.equal(result.debug.rejectedReasons["unknown-hours"], 1);
  const closed = await providerFor([place({ regularOpeningHours: { periods: [{ open: { day: 0, hour: 19 }, close: { day: 0, hour: 20 } }] } })]).provider.discoverWithDebug(prefs);
  assert.deepEqual(closed.venues, []);
  assert.equal(closed.debug.rejectedReasons.hours, 1);
});

test("specific activity outranks unrelated highly rated cafés while preserving curated and Google options", async () => {
  const skate = (await providerFor([place({ rating: 1 })]).provider.discover(prefs))[0];
  const coffees = Array.from({ length: 18 }, (_, i) => cafe(`fixture-coffee-${i}`, i < 9 ? "curated" : "google"))
    .map((v, i) => ({ ...v, name: `Fixture Coffee ${i}`, address: `Fixture Street ${i}`, lat: v.lat + i * .0001 }));
  const intent = interpretPreferences(prefs);
  assert.ok(scoreVenue(skate, prefs, intent).score > scoreVenue(coffees[0], prefs, intent).score);
  const candidates = selectCandidates([...coffees, skate], prefs, intent);
  assert.equal(candidates[0].id, skate.id);
  assert.ok(candidates.some(v => v.source === "curated"));
  assert.ok(candidates.some(v => v.source === "google" && v.id !== skate.id));
  const plan = optimiseExperience(candidates, prefs, demoMatrix(candidates, prefs.transport), intent);
  assert.ok(plan);
  assert.ok(plan.stops.some(v => v.id === skate.id));
  assert.ok(plan.stops.some(v => v.activityRole === "cafe"));
  assert.ok(coversTag(plan.stops, "skate park"));
});

test("generic requests and named research resolutions do not perform an extra activity search", async () => {
  const { provider, requests } = providerFor([]);
  assert.equal((await provider.discoverWithDebug({ ...prefs, notes: "a relaxed day" })).debug.targetedQueries, 0);
  const before = requests.length;
  await provider.resolveResearch(prefs, [{ name: "Fixture Coffee", locality: "Sydney", tags: ["Coffee shops"] }]);
  assert.equal(requests.length, before + 1);
  assert.ok(requests.every(r => r.body.includedType === undefined));
});

test("target query errors preserve successful normal results, with failure counts and no retry", async () => {
  const calls = [];
  const provider = createGoogleProvider("mock-only-key", async (_url, options) => {
    const query = JSON.parse(options.body).textQuery; calls.push(query);
    return query.startsWith("skate park") ? Response.json({}, { status: 503 }) : Response.json({ places: [place({ types: ["cafe"], displayName: { text: "Fixture Coffee" } })] });
  }, { curated: () => [] });
  const result = await provider.discoverWithDebug(prefs);
  assert.equal(result.venues.length, 1);
  assert.equal(result.debug.failedQueries, 1);
  assert.equal(calls.length, 2);
});

test("API returns additive discovery debug counts without exposing credentials", async () => {
  const { provider } = providerFor([place(), place({ id: "bad", displayName: {} })]);
  const server = createApiServer({ env: { GOOGLE_MAPS_API_KEY: "mock-only-key" }, googleProvider: provider });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/venues`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.venues.length, 1);
    assert.equal(body.debug.googleCandidates, 1);
    assert.equal(body.debug.rejectedReasons.identity, 1);
    assert.equal(JSON.stringify(body).includes("mock-only-key"), false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test("existing browsing and generation use targeted results without frontend contract changes", async () => {
  const { provider } = providerFor([place()]);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("/api/"), "Only synthetic application endpoints allowed");
    if (url === "/api/status") return Response.json({ venues: "google", recommendations: "planner", socialDiscovery: "unavailable" });
    if (url === "/api/venues") return Response.json(await provider.discoverWithDebug(JSON.parse(options.body).prefs));
    if (url === "/api/discovery") return Response.json({ venues: [], leads: [] });
    if (url === "/api/matrix") return Response.json({ matrix: demoMatrix(JSON.parse(options.body).venues, prefs.transport) });
    assert.fail(`Unexpected endpoint ${url}`);
  };
  try {
    const browse = await prepareBrowse(prefs);
    assert.equal(browse.candidates[0].id, "fixture-skate");
    const { plan } = await generate(prefs);
    assert.ok(plan.stops.some(v => v.id === "fixture-skate"));
    assert.ok(plan.stops.some(v => v.source === "curated"));
  } finally { globalThis.fetch = original; }
});

test("compound requests select the first unmet activity with only one extra query", async () => {
  const input = { ...prefs, notes: "I want a coffee shop and a skate park and a pottery studio" };
  const { provider, requests } = providerFor([place()]);
  const result = await provider.discoverWithDebug(input);
  assert.deepEqual(interpretPreferences(input).requestedActivities.map(a => a.query), ["coffee shop", "skate park", "pottery studio"]);
  assert.equal(result.debug.requestedActivity, "skate park");
  assert.equal(result.debug.targetedQueries, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests.filter(r => r.body.textQuery.startsWith("skate park")).length, 1);
});

test("an unknown-hours trampoline park is not assumed outdoor just because the request says park", async () => {
  const provider = createGoogleProvider("mock-only-key", async () => Response.json({ places: [place({
    displayName: { text: "Fixture Trampoline Park" }, types: ["amusement_center"], regularOpeningHours: undefined,
  })] }), { curated: () => [] });
  const result = await provider.discoverWithDebug({ ...prefs, notes: "I want a trampoline park" });
  assert.deepEqual(result.venues, []);
  assert.equal(result.debug.unverifiedSuggestions, 0);
  assert.equal(result.debug.rejectedReasons["unknown-hours"], 2);
});

test("unverified suggestions remain inspectable through existing browsing without claiming an available schedule", async () => {
  const { provider } = providerFor([place({ regularOpeningHours: undefined })]);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("/api/"));
    if (url === "/api/status") return Response.json({ venues: "google", recommendations: "planner", socialDiscovery: "unavailable" });
    if (url === "/api/venues") return Response.json(await provider.discoverWithDebug(JSON.parse(options.body).prefs));
    if (url === "/api/discovery") return Response.json({ venues: [], leads: [] });
    assert.fail(`Unexpected endpoint ${url}`);
  };
  try {
    const browse = await prepareBrowse(prefs);
    const suggestion = browse.candidates.find(v => v.id === "fixture-skate");
    assert.ok(suggestion);
    assert.equal(suggestion.hoursStatus, "unverified");
    assert.equal(venueRejection(suggestion, prefs, interpretPreferences(prefs)), "unknown-hours");
  } finally { globalThis.fetch = original; }
});

test("public outdoor facilities may omit business status without invented hours or ignoring a closure", async () => {
  const result = await providerFor([place({ businessStatus: undefined, regularOpeningHours: undefined }),
    place({ id: "closed-outdoor", businessStatus: "CLOSED_TEMPORARILY", regularOpeningHours: undefined }),
    place({ id: "bad-types", types: {} })]).provider.discoverWithDebug(prefs);
  assert.deepEqual(result.venues.map(v => v.id), ["fixture-skate"]);
  assert.equal(result.venues[0].hoursStatus, "unverified");
  assert.deepEqual(result.debug.rejectedReasons, { "not-operational": 1, identity: 1 });
});

test("an activity outside the tag catalogue uses a direct query and independently matched identity", async () => {
  const requests = [];
  const provider = createGoogleProvider("mock-only-key", async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    return Response.json({ places: body.textQuery.startsWith("bouldering gym") ? [place({
      displayName: { text: "Fixture Bouldering Gym" }, types: ["gym"], priceLevel: "PRICE_LEVEL_MODERATE",
    })] : [] });
  }, { curated: () => [cafe()] });
  const result = await provider.discoverWithDebug({ ...prefs, notes: "I want a bouldering gym" });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].includedType, undefined); // No invented Google type.
  assert.equal(result.debug.targetedQueries, 1);
  assert.equal(result.venues[0].category, "bouldering gym");
  assert.equal(result.venues[0].cost, 45);
  assert.deepEqual(result.venues[0].roles, ["activity"]);
});

test("a park phrase does not lower an indoor facility's unknown-price allowance", async () => {
  const provider = createGoogleProvider("mock-only-key", async () => Response.json({ places: [place({
    displayName: { text: "Fixture Trampoline Park" }, types: ["amusement_center"], priceLevel: undefined,
  })] }), { curated: () => [] });
  const result = await provider.discoverWithDebug({ ...prefs, notes: "I want a trampoline park" });
  assert.equal(result.venues.length, 1);
  assert.equal(result.venues[0].cost, 35);
});

test("trusted curated category aliases satisfy an explicit café request", async () => {
  const { provider, requests } = providerFor([]);
  const result = await provider.discoverWithDebug({ ...prefs, notes: "I want a cafe" });
  assert.equal(result.debug.curatedActivityMatches, 1);
  assert.equal(result.debug.targetedQueries, 0);
  assert.equal(requests.length, 1);
});
