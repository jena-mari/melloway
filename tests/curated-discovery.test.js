import test from "node:test";
import assert from "node:assert/strict";
import { curatedVenuesForDate } from "../src/data/sydneyVenues.js";
import { defaultDraft } from "../src/data/preferences.js";
import { mergeDiscoveryPool, sameBusiness } from "../src/engine/discoveryPool.ts";
import { selectCandidates, venueRejection } from "../src/engine/filtering.js";
import { interpretPreferences } from "../src/engine/preferences.js";
import { scoreVenue } from "../src/engine/scoring.js";
import { demoMatrix } from "../src/utils/planner.js";
import { generate, prepareReplacement, prepareAdditions } from "../src/services/discovery.js";

const date = "2026-10-18";
const curated = curatedVenuesForDate(date);
const prefs = { ...defaultDraft(), date };
const intent = interpretPreferences(prefs);
const byId = (id) => curated.find((v) => v.id === `sydney-${id}`);

// Synthetic provider fixtures only; no Google/OpenAI requests or quoted prices.
function googleVenue(index, overrides = {}) {
  const templates = [byId("library-cafe"), byId("art-gallery"), byId("botanic-garden")];
  return {
    ...templates[index % templates.length],
    id: `google-test-${index}`,
    name: `Test Google business ${index}`,
    address: `${index + 1} Test Street, Sydney NSW 2000`,
    lat: -33.8735 + index * 0.00001,
    lng: 151.2065,
    source: "google",
    cost: 0,
    mins: 30,
    rating: 4.9,
    ...overrides,
  };
}
const googleResults = Array.from({ length: 24 }, (_, i) => googleVenue(i));

function mockProviders(t, { venues = googleResults, ai = false, status = "google", fail = "", rankings } = {}) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const endpoint = String(url).split("/api/")[1];
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ endpoint, body });
    if (endpoint === fail) return Response.json({ error: "fixture failure" }, { status: 502 });
    switch (endpoint) {
      case "status": return Response.json({ venues: status, recommendations: ai ? "openai" : "planner" });
      case "venues": return Response.json({ venues });
      case "intent": return Response.json({ intent: interpretPreferences(body.prefs) });
      case "recommendations": return Response.json({ rankings: body.venues.map(rankings || ((v) => ({ venueId: v.id, fit: 7, exclude: false }))) });
      case "matrix": return Response.json({ matrix: demoMatrix(body.venues, body.prefs.transport).map((row) => row.map((edge) => ({ ...edge, source: "google" }))) });
      default: throw new Error(`Unexpected fixture endpoint ${endpoint}`);
    }
  });
  return requests;
}

test("Google supplements every one of the 36 curated records without replacing editorial facts", () => {
  assert.equal(curated.length, 36);
  const original = byId("matchaya");
  const duplicate = googleVenue(90, {
    name: "Matcha Ya",
    address: original.address.replace("Street", "St"),
    lat: original.lat + 0.0001,
    lng: original.lng,
    tags: ["Coffee shops"],
    description: "Provider description",
    cost: 999,
  });
  const pool = mergeDiscoveryPool(curated, [duplicate, ...googleResults, googleResults[0]]);
  assert.equal(pool.length, 36 + googleResults.length);
  assert.deepEqual(pool.slice(0, 36), curated);
  assert.equal(pool.find((v) => v.id === original.id), original);
  assert.ok(!pool.some((v) => v.id === duplicate.id));
  assert.deepEqual(pool.find((v) => v.id === original.id).tags, original.tags);
  assert.equal(pool.find((v) => v.id === original.id).rating, undefined);
  assert.equal(pool.find((v) => v.id === original.id).cost, original.cost);
});

test("business matching handles punctuation, suburb suffixes, street ranges and small coordinate differences", () => {
  const original = byId("single-o");
  assert.ok(sameBusiness(original, googleVenue(91, {
    name: "Single O", area: "Surry Hills",
    address: "64 Reservoir St, Surry Hills NSW 2010, Australia",
    lat: original.lat + 0.0001, lng: original.lng,
  })));
  const bar = byId("baxter");
  assert.ok(sameBusiness(bar, googleVenue(92, {
    name: "Baxter Inn", address: bar.address,
    lat: bar.lat, lng: bar.lng,
  })));
  const restaurant = byId("mamak");
  assert.ok(sameBusiness(restaurant, googleVenue(93, {
    name: "Mamak", address: "15 Goulburn St, Haymarket NSW 2000",
    lat: restaurant.lat, lng: restaurant.lng,
  })));
  const books = byId("kinokuniya");
  assert.ok(sameBusiness(books, googleVenue(94, {
    name: "Kinokuniya", address: "500 George St, Sydney NSW 2000",
    lat: books.lat, lng: books.lng,
  })));
});

test("same-name branches and different businesses sharing an address remain separate", () => {
  const original = googleVenue(0);
  const nearbyBranch = { ...original, id: "branch-near", address: "2 Test Street, Sydney", lat: original.lat + 0.0001 };
  const distantBranch = { ...original, id: "branch-far", lat: original.lat + 0.03 };
  const neighbour = { ...original, id: "neighbour", name: "Another test business" };
  for (const venue of [nearbyBranch, distantBranch, neighbour]) assert.equal(sameBusiness(original, venue), false);
  assert.equal(mergeDiscoveryPool([original], [nearbyBranch, distantBranch, neighbour]).length, 4);
  const candidates = selectCandidates([original, nearbyBranch], prefs, intent);
  assert.equal(candidates.length, 2);
});

test("unknown curated hours and estimates are not replaced or invented from a matching Google record", () => {
  const original = byId("hubert");
  const duplicate = googleVenue(93, { name: original.name, address: original.address, lat: original.lat, lng: original.lng });
  const pool = mergeDiscoveryPool(curated, [duplicate]);
  assert.equal(pool.length, 36);
  assert.equal(pool.find((v) => v.id === original.id), original);
  assert.equal(original.weeklyHours, null);
  assert.equal(original.rating, undefined);
  assert.equal(original.priceStatus, "estimate");
  assert.ok(!selectCandidates(pool, prefs, intent).some((v) => v.id === original.id));
});

test("14-candidate shortlist retains seven eligible curated matches despite a flood of higher-scored Google results", () => {
  const all = mergeDiscoveryPool(curated, googleResults);
  const candidates = selectCandidates(all, prefs, intent);
  assert.equal(candidates.length, 14);
  assert.equal(candidates.filter((v) => v.source === "curated").length, 7);
  assert.equal(candidates.filter((v) => v.source === "google").length, 7);
  for (const candidate of candidates) assert.equal(venueRejection(candidate, prefs, intent), null);
  // Without source representation the common score ranks only Google in the top 14.
  const ordinaryTop = all.filter((v) => !venueRejection(v, prefs, intent))
    .map((v) => scoreVenue(v, prefs, intent)).sort((a, b) => b.score - a.score).slice(0, 14);
  assert.ok(ordinaryTop.every((v) => v.source === "google"));
});

test("shortlist preserves requested-role coverage while filtering unsuitable curated venues", () => {
  const requested = { ...prefs, preferences: ["Matcha cafés", "Art galleries", "Scenic walks"] };
  const requestIntent = interpretPreferences(requested);
  const candidates = selectCandidates(mergeDiscoveryPool(curated, googleResults), requested, requestIntent, { rejectedIds: ["sydney-art-gallery"] });
  for (const role of requestIntent.requiredRoles)
    assert.ok(candidates.some((v) => v.roles.includes(role)));
  assert.ok(candidates.some((v) => v.source === "curated" && v.tags.includes("Matcha cafés")));
  for (const id of ["sydney-art-gallery", "sydney-hubert", "sydney-bistecca", "sydney-maeda", "sydney-baxter", "sydney-single-o"])
    assert.ok(!candidates.some((v) => v.id === id), `${id} must stay excluded`);
  for (const candidate of candidates)
    assert.equal(venueRejection(candidate, requested, requestIntent, ["sydney-art-gallery"]), null);
});

test("both sources rank by the same interests, vibe, budget and distance rules", () => {
  const requested = { ...prefs, preferences: ["Art galleries"], notes: "romantic", diningVibes: ["Cozy"] };
  const requestIntent = interpretPreferences(requested);
  for (const source of ["curated", "google"]) {
    const matching = googleVenue(1, { source, atmosphere: ["romantic"] });
    const mismatch = { ...matching, tags: ["Coffee shops"], atmosphere: [], cost: 70, lat: matching.lat + 0.01 };
    const good = scoreVenue(matching, requested, requestIntent);
    const poor = scoreVenue(mismatch, requested, requestIntent);
    for (const dimension of ["preference", "atmosphere", "budget", "proximity"])
      assert.ok(good.scoreBreakdown[dimension] > poor.scoreBreakdown[dimension], `${source}: ${dimension}`);
  }
});

test("Google-only planning remains possible when every curated record is ineligible", () => {
  const unknown = curated.map((v) => ({ ...v, weeklyHours: null, hours: null }));
  const candidates = selectCandidates(mergeDiscoveryPool(unknown, googleResults), prefs, intent);
  assert.equal(candidates.length, 14);
  assert.ok(candidates.every((v) => v.source === "google"));
});

test("generation sends curated and Google candidates through the existing OpenAI and route pipeline", async (t) => {
  const original = byId("matchaya");
  const duplicate = googleVenue(94, { name: original.name, address: original.address, lat: original.lat, lng: original.lng });
  const requests = mockProviders(t, { ai: true, venues: [duplicate, ...googleResults] });
  const result = await generate(prefs);
  assert.ok(result.plan);
  assert.equal(result.plan.recommendationSource, "openai");
  assert.ok(result.plan.cost <= prefs.budget);
  assert.ok(result.plan.elapsed <= prefs.duration * 60);
  const recommendation = requests.find((r) => r.endpoint === "recommendations").body;
  assert.equal(recommendation.venues.length, 14);
  assert.equal(recommendation.venues.filter((v) => v.source === "curated").length, 7);
  assert.ok(recommendation.venues.some((v) => v.source === "google"));
  assert.ok(!recommendation.venues.some((v) => v.id === duplicate.id));
  const routing = requests.find((r) => r.endpoint === "matrix").body;
  assert.deepEqual(routing.venues.map((v) => v.id), result.candidates.map((v) => v.id));
  assert.ok(result.matrix.flat().every((edge) => edge.source === "google"));
  assert.match(result.notice, /linked sources/);
  assert.match(result.notice, /Google Places/);
  for (const candidate of result.candidates.filter((v) => v.source === "curated")) {
    const record = curated.find((v) => v.id === candidate.id);
    for (const key of ["tags", "description", "address", "weeklyHours", "rating", "priceStatus"])
      assert.deepEqual(candidate[key], record[key]);
  }
});

test("curated shortlist representation never overrides OpenAI exclusions or forces itinerary stops", async (t) => {
  const requests = mockProviders(t, {
    ai: true,
    rankings: (v) => ({ venueId: v.id, fit: 10, exclude: v.source === "curated" }),
  });
  const result = await generate(prefs);
  assert.ok(requests.find((r) => r.endpoint === "recommendations").body.venues.some((v) => v.source === "curated"));
  assert.ok(result.plan);
  assert.equal(result.plan.recommendationSource, "openai");
  assert.ok(result.candidates.every((v) => v.source === "google"));
  assert.ok(result.plan.stops.every((v) => v.source === "google"));
});

for (const scenario of ["no key", "Google failure", "empty results", "invalid results", "backend failure"])
  test(`curated generation still works with ${scenario}`, async (t) => {
    const requests = mockProviders(t, {
      status: scenario === "no key" ? "curated" : "google",
      fail: scenario === "Google failure" ? "venues" : scenario === "backend failure" ? "status" : "",
      venues: scenario === "invalid results" ? [{ source: "google", id: "invalid" }] : [],
    });
    const result = await generate(prefs);
    assert.ok(result.plan);
    assert.ok(result.candidates.every((v) => v.source === "curated"));
    assert.ok(result.plan.stops.every((v) => v.source === "curated"));
    assert.ok(!requests.some((r) => r.endpoint === "matrix"));
    if (scenario === "no key") assert.ok(!requests.some((r) => r.endpoint === "venues"));
  });

test("one valid Google result supplements curation even alongside malformed results", async (t) => {
  const requests = mockProviders(t, { venues: [{ source: "google", id: "bad" }, googleResults[0]] });
  const result = await generate(prefs);
  assert.ok(result.plan);
  assert.ok(result.candidates.some((v) => v.id === googleResults[0].id));
  assert.ok(result.candidates.some((v) => v.source === "curated"));
  assert.ok(!result.candidates.some((v) => v.id === "bad"));
  assert.ok(requests.some((r) => r.endpoint === "matrix"));
});

for (const fail of [false, true])
  test(`replacement and extras retain curated choices and selected stops when Google ${fail ? "fails" : "succeeds"}`, async (t) => {
    const selected = googleVenue(95, { ...byId("matchaya"), id: "google-chosen-matcha", source: "google" });
    const plan = { stops: [selected], prefs, intent, rejectedIds: [] };
    mockProviders(t, { fail: fail ? "venues" : "", venues: [selected, ...googleResults] });
    for (const result of [await prepareReplacement(plan), await prepareAdditions(plan)]) {
      assert.equal(result.candidates[0].id, selected.id);
      assert.deepEqual(result.candidates[0].tags, selected.tags);
      assert.ok(result.candidates.some((v) => v.source === "curated"));
      assert.ok(!result.candidates.some((v) => v.id === "sydney-matchaya"));
      assert.ok(result.candidates.length <= 14);
      for (const [i, candidate] of result.candidates.entries())
        assert.ok(!result.candidates.slice(i + 1).some((v) => sameBusiness(candidate, v)));
    }
  });

test("provider fallback respects cancellation", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/status")) return Response.json({ venues: "google" });
    controller.abort();
    throw controller.signal.reason;
  });
  await assert.rejects(generate(prefs, 0, () => {}, null, { signal: controller.signal }), { name: "AbortError" });
});
