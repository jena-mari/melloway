import test from "node:test";
import assert from "node:assert/strict";
import { defaultDraft, categories } from "../src/data/preferences.js";
import { sydneyVenues, curatedVenuesForDate } from "../src/data/sydneyVenues.js";
import { interpretPreferences } from "../src/engine/preferences.js";
import { selectCandidates, venueRejection } from "../src/engine/filtering.js";
import { optimiseExperience } from "../src/engine/generation.js";
import { closestExperience } from "../src/engine/alternatives.js";
import { demoMatrix, schedule, km } from "../src/utils/planner.js";

const addedIds = [
  "black-star-newtown", "rising-sun", "single-o", "reuben-hills",
  "edition-darling-square", "cipher-newtown", "escape-hunt", "timezone-haymarket",
  "golden-age", "hyde-park-barracks", "camperdown-rest-park", "hyde-park",
  "anzac-memorial", "chinese-garden", "australian-museum",
].map((id) => `sydney-${id}`);
const additions = sydneyVenues.filter((v) => addedIds.includes(v.id));
const venue = (id) => sydneyVenues.find((v) => v.id === `sydney-${id}`);
function build(overrides, all) {
  const prefs = {
    ...defaultDraft(), date: "2026-10-17", time: "11:00", timeExplicit: true,
    duration: 5, ...overrides,
  };
  const intent = interpretPreferences(prefs);
  const candidates = selectCandidates(all || curatedVenuesForDate(prefs.date), prefs, intent);
  const matrix = demoMatrix(candidates, prefs.transport);
  const plan = optimiseExperience(candidates, prefs, matrix, intent);
  return { prefs, intent, candidates, matrix, plan };
}
function feasible({ plan, prefs, candidates, matrix, intent }) {
  assert.ok(plan);
  assert.ok(plan.cost <= prefs.budget);
  assert.ok(plan.elapsed <= prefs.duration * 60);
  assert.equal(new Set(plan.stops.map((s) => s.id)).size, plan.stops.length);
  assert.ok(intent.requiredTags.every((tag) => plan.stops.some((s) => s.tags.includes(tag))));
  assert.ok(schedule(plan.stops, prefs, matrix, plan.stops.map((s) => candidates.findIndex((v) => v.id === s.id))));
  for (const [i, stop] of plan.stops.entries()) {
    assert.equal(stop.source, "curated");
    assert.ok(stop.weeklyHours);
    assert.equal(venueRejection(stop, prefs, intent), null);
    if (i) {
      assert.ok(km(stop, plan.stops[i - 1]) <= 2.5);
      assert.equal(stop.travelFromPrevious.source, "estimate");
    }
  }
}
function oneStop(id, overrides = {}) {
  const prefs = { ...defaultDraft(), date: "2026-10-17", time: "11:00", budget: 100, ...overrides };
  const stop = venue(id);
  return schedule([stop], prefs, demoMatrix([stop], prefs.transport), [0]);
}

test("15 sourced additions preserve the original catalogue and deduplicate identities", () => {
  assert.equal(additions.length, 15);
  assert.equal(sydneyVenues.length, 36);
  assert.equal(sydneyVenues.filter((v) => !addedIds.includes(v.id)).length, 21);
  assert.equal(new Set(sydneyVenues.map((v) => v.id)).size, sydneyVenues.length);
  const names = sydneyVenues.map((v) => v.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(new Set(additions.map((v) => v.area)), new Set(["Newtown", "Surry Hills", "Sydney CBD"]));
  const tags = new Set(Object.values(categories).flat());
  for (const v of additions) {
    assert.ok(v.address && v.category && v.roles.length && v.tags.length);
    assert.ok(v.tags.every((tag) => tags.has(tag)));
    assert.ok(v.lat > -33.92 && v.lat < -33.85 && v.lng > 151.16 && v.lng < 151.23);
    assert.equal(v.source, "curated");
    assert.equal(v.coordinatesStatus, "approximate");
    assert.equal(v.priceStatus, "estimate");
    assert.ok(v.cost >= 0 && v.mins > 0);
    assert.match(v.note, /allowance|estimated/i);
    assert.ok(v.sources.some((s) => s.url === v.website));
    assert.ok(v.sources.some((s) => s.fields.includes("coordinates") && s.attribution));
    assert.ok(v.sources.every((s) => /^https:\/\//.test(s.url) && s.checkedAt === v.checkedAt));
    assert.ok(v.sources.every((s) => !/googleapis|google\.com|maps\.app\.goo/.test(s.url)));
    for (const field of ["rating", "reviews", "image", "photo", "googleId", "placeId"]) assert.equal(v[field], undefined);
    if (v.weeklyHours) {
      assert.equal(v.weeklyHours.length, 7);
      for (const day of v.weeklyHours) for (const w of day) assert.ok(w.open >= 0 && w.close > w.open && w.close <= 2880);
    } else {
      assert.equal(v.hoursStatus, "unconfirmed");
      assert.ok(!v.sources.some((s) => s.fields.includes("published hours")));
    }
  }
});

test("the catalogue supports a local Newtown coffee and escape-room outing", () => {
  const result = build({ area: "Newtown", preferences: ["Coffee shops", "Escape rooms"], budget: 100 });
  feasible(result);
  assert.ok(result.plan.stops.some((s) => s.id === "sydney-cipher-newtown"));
  assert.ok(result.plan.stops.every((s) => s.area === "Newtown"));
});

test("a CBD arcade and dessert outing uses the new activity without exceeding $50", () => {
  const result = build({ preferences: ["Arcades", "Desserts"], budget: 50 });
  feasible(result);
  assert.ok(result.plan.stops.some((s) => s.id === "sydney-timezone-haymarket"));
});

test("Surry Hills coffee, a museum and a garden can fit a $35 walking outing", () => {
  const result = build({ area: "Surry Hills", preferences: ["Coffee shops", "Museums", "Scenic walks"], budget: 35 });
  feasible(result);
  assert.ok(result.plan.stops.some((s) => ["sydney-single-o", "sydney-reuben-hills"].includes(s.id)));
  assert.ok(result.plan.stops.some((s) => s.id === "sydney-chinese-garden"));
});

test("each new free museum can pair with an existing free walk without fake ticket prices", () => {
  for (const id of ["australian-museum", "hyde-park-barracks", "anzac-memorial"]) {
    const date = "2026-10-17";
    const actualRecords = curatedVenuesForDate(date).filter((v) => [`sydney-${id}`, "sydney-botanic-garden"].includes(v.id));
    const result = build({ date, preferences: ["Museums", "Scenic walks"], budget: 0 }, actualRecords);
    feasible(result);
    assert.equal(result.plan.cost, 0);
    assert.ok(result.plan.stops.some((s) => s.id === `sydney-${id}`));
  }
});

test("unpublished closing times and park access hours remain unschedulable", () => {
  for (const id of ["golden-age", "camperdown-rest-park", "hyde-park"]) {
    const { prefs, intent } = build({ area: venue(id).area, budget: 100 });
    assert.equal(venueRejection(venue(id), prefs, intent), "unknown-hours");
    assert.equal(oneStop(id), null);
  }
});

test("operator weekday windows and restaurant service breaks constrain new venues", () => {
  assert.equal(oneStop("cipher-newtown", { date: "2026-10-19", time: "11:00" }), null);
  assert.ok(oneStop("cipher-newtown", { date: "2026-10-20", time: "11:00" }));
  assert.equal(oneStop("single-o", { date: "2026-10-18", time: "07:00", duration: 3 }).stops[0].arrival, 480);
  assert.equal(oneStop("single-o", { date: "2026-10-19", time: "07:00" }).stops[0].arrival, 420);
  // Finish before the lunch-service break; never bridge it or invent Friday dinner closing hours.
  assert.equal(oneStop("rising-sun", { date: "2026-10-16", time: "14:30", duration: 3 }), null);
  assert.equal(oneStop("rising-sun", { date: "2026-10-16", time: "17:00" }), null);
  assert.ok(oneStop("rising-sun", { date: "2026-10-18", time: "17:00" }));
  assert.equal(oneStop("timezone-haymarket", { date: "2026-10-19", time: "09:00" }).stops[0].arrival, 600);
});

test("museum and garden holiday closures are preserved and last entry is respected", () => {
  for (const id of ["hyde-park-barracks", "anzac-memorial", "chinese-garden", "australian-museum"]) {
    assert.equal(oneStop(id, { date: "2026-12-25" }), null);
    assert.ok(oneStop(id, { date: "2026-12-24" }));
  }
  for (const id of ["hyde-park-barracks", "anzac-memorial", "chinese-garden"]) assert.equal(oneStop(id, { date: "2027-03-26" }), null);
  assert.ok(oneStop("hyde-park-barracks", { time: "16:30" }));
  assert.equal(oneStop("hyde-park-barracks", { time: "16:31" }), null);
});

test("new food allowances cannot be replaced by cheaper drinks to fit a brunch request", () => {
  const result = build({ area: "Surry Hills", preferences: ["Brunch"], budget: 20 });
  assert.ok(!result.candidates.some((v) => ["sydney-single-o", "sydney-reuben-hills", "sydney-edition-darling-square"].includes(v.id)));
  const affordable = build({ area: "Surry Hills", preferences: ["Brunch"], budget: 40 });
  assert.equal(affordable.candidates.find((v) => v.id === "sydney-single-o").cost, 30);
  assert.equal(affordable.candidates.find((v) => v.id === "sydney-reuben-hills").cost, 35);
});

test("more venues cannot force an infeasible request into a route", () => {
  for (const input of [
    { area: "Newtown", preferences: ["Escape rooms"], budget: 20 },
    { area: "Newtown", preferences: ["Escape rooms"], budget: 100, date: "2026-10-19" },
    { preferences: ["Museums"], budget: 0, time: "23:00" },
    { area: "Newtown", preferences: ["Coffee shops", "Escape rooms"], budget: 100, time: "21:30", duration: 3 },
  ]) assert.equal(build(input).plan, null);
});

test("expanded-catalogue regeneration retains the closest browsing alternative and all hard constraints", () => {
  const { prefs, intent } = build({
    area: "Newtown", preferences: ["Thrifting"], date: "2026-10-18", time: "18:00",
  });
  const candidates = selectCandidates(curatedVenuesForDate(prefs.date), prefs, { ...intent, allowAlternatives: true });
  const matrix = demoMatrix(candidates, prefs.transport);
  const first = closestExperience(candidates, prefs, matrix, intent);
  assert.ok(first);
  const excludeSignature = first.stops.map((s) => s.id).sort().join("|");
  const next = closestExperience(candidates, prefs, matrix, intent, { excludeSignature });
  assert.ok(next);
  // Companions may change; the original browsing interest and budget/time/hours must hold.
  feasible({ plan: next, prefs, candidates, matrix, intent: next.intent });
  assert.deepEqual(
    next.stops.filter((s) => s.activityRole === "bookshop").map((s) => s.id),
    first.stops.filter((s) => s.activityRole === "bookshop").map((s) => s.id),
  );
  assert.ok(next.stops.some((s) => s.id === "sydney-better-read"));
  assert.ok(next.stops.every((s) => s.activityRole !== "activity"));
  assert.deepEqual(next.adjustments, first.adjustments);
  assert.match(next.matchNotice, /Bookshops instead of Thrifting/);
});
