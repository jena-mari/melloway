import test from "node:test";
import assert from "node:assert/strict";
import { defaultDraft } from "../src/data/preferences.js";
import {
  curatedVenuesForDate,
  sydneyVenues,
} from "../src/data/sydneyVenues.js";
import {
  interpretPreferences,
  resolvePlanningTime,
  mergeIntent,
} from "../src/engine/preferences.js";
import { selectCandidates, venueRejection } from "../src/engine/filtering.js";
import {
  optimiseExperience,
  explainNoMatch,
} from "../src/engine/generation.js";
import { replaceExperienceStop } from "../src/engine/replacement.js";
import { demoMatrix, km, schedule, editRoute } from "../src/utils/planner.js";
import { scoreVenue } from "../src/engine/scoring.js";

function build(overrides, excluded) {
  let prefs = { ...defaultDraft(), date: "2026-10-18", ...overrides };
  const intent = interpretPreferences(prefs);
  prefs = resolvePlanningTime(prefs, intent).prefs;
  const all = curatedVenuesForDate(prefs.date),
    candidates = selectCandidates(all, prefs, intent);
  const matrix = demoMatrix(candidates, prefs.transport);
  const plan = optimiseExperience(
    candidates,
    prefs,
    matrix,
    intent,
    excluded ? { excludeSignature: excluded } : {},
  );
  return { prefs, intent, all, candidates, matrix, plan };
}
function feasible({ plan, prefs }) {
  assert.ok(plan);
  assert.ok(plan.cost <= prefs.budget);
  assert.ok(plan.elapsed <= prefs.duration * 60);
  assert.equal(new Set(plan.stops.map((v) => v.id)).size, plan.stops.length);
  for (const [i, v] of plan.stops.entries()) {
    assert.equal(v.source, "curated");
    assert.ok(v.address && v.website && v.reason);
    if (i) assert.ok(km(v, plan.stops[i - 1]) <= 2.5);
  }
}
test("A: romantic CBD evening sequences sourced hidden bars around an upscale dinner", () => {
  const result = build({
    notes: "romantic evening with speakeasies and fancy dinner",
    budget: 170,
  });
  feasible(result);
  assert.equal(result.prefs.time, "18:00");
  assert.deepEqual(result.plan.sequence, ["bar", "meal", "bar"]);
  assert.ok(
    result.plan.stops
      .filter((v) => v.activityRole === "bar")
      .every((v) => v.hidden),
  );
  assert.ok(result.plan.stops.find((v) => v.activityRole === "meal").upscale);
});
test("B: Newtown matcha and thrifting stays local and varies activities", () => {
  const result = build({
    area: "Newtown",
    notes: "matcha, thrifting and a slow afternoon",
  });
  feasible(result);
  assert.deepEqual(result.plan.sequence, ["cafe", "shop", "bookshop"]);
  assert.ok(result.plan.stops[0].tags.includes("Matcha cafés"));
  assert.ok(result.plan.stops[1].tags.includes("Thrifting"));
  assert.ok(result.plan.stops.every((v) => v.area === "Newtown"));
});
test("C: art, walking and cheap food stays within a $40 total allowance", () => {
  const result = build({ notes: "art, walking and cheap food", budget: 40 });
  feasible(result);
  assert.deepEqual(result.plan.sequence, ["culture", "walk", "meal"]);
  assert.equal(result.plan.cost, 30);
});
test("D: a $20 fine-dining request explains the mismatch without substituting demos", () => {
  const result = build({ notes: "fine dining", budget: 20 });
  assert.equal(result.plan, null);
  assert.match(
    explainNoMatch(result.all, result.prefs, result.intent, result.candidates),
    /fine-dining.*\$110.*\$20/,
  );
});
test("specific cuisines, market days and food allowances are not replaced with generic activities", () => {
  const italian = build({ preferences: ["Italian food"], budget: 40 });
  assert.equal(italian.plan, null);
  assert.match(
    explainNoMatch(
      italian.all,
      italian.prefs,
      italian.intent,
      italian.candidates,
    ),
    /italian food.*\$110/,
  );
  assert.equal(
    build({ area: "Newtown", preferences: ["Brunch"], budget: 20 }).plan,
    null,
  );
  const food = build({ area: "Newtown", preferences: ["Brunch"], budget: 40 });
  assert.equal(food.candidates.find((v) => v.id === "sydney-maeda").cost, 30);
  feasible(food);
  assert.equal(
    build({ preferences: ["Flea markets"], date: "2026-10-18" }).plan,
    null,
  );
  const market = build({
    preferences: ["Flea markets", "Matcha cafés"],
    date: "2026-10-17",
  });
  feasible(market);
  assert.ok(market.plan.stops.some((v) => v.name === "Glebe Markets"));
});
test("chosen times and inferred evening times survive interpretation and regeneration", () => {
  const intent = interpretPreferences({ notes: "fancy dinner" });
  assert.equal(
    resolvePlanningTime({ ...defaultDraft(), time: "19:30" }, intent).prefs
      .time,
    "19:30",
  );
  assert.equal(
    resolvePlanningTime(
      { ...defaultDraft(), time: "11:00", timeExplicit: true },
      intent,
    ).prefs.time,
    "11:00",
  );
  const first = resolvePlanningTime(
    { ...defaultDraft(), notes: "fancy dinner starting at 7pm" },
    intent,
  );
  assert.equal(first.prefs.time, "19:00");
  assert.equal(resolvePlanningTime(first.prefs, intent).prefs.time, "19:00");
  assert.equal(
    resolvePlanningTime(
      first.prefs,
      interpretPreferences({ notes: "matcha and books" }),
    ).prefs.time,
    "11:00",
  );
});
test("negative preferences override selected tags and unsupported activities do not become generic routes", () => {
  const result = build({
    preferences: ["Fine dining"],
    notes: "no fine dining, matcha and books",
  });
  feasible(result);
  assert.equal(result.intent.upscaleMeal, false);
  assert.ok(result.plan.stops.every((v) => !v.upscale));
  assert.ok(result.plan.stops.some((v) => v.tags.includes("Matcha cafés")));
  assert.ok(result.plan.stops.some((v) => v.tags.includes("Bookshops")));
  assert.equal(build({ preferences: ["Photo booths"] }).plan, null);
  assert.equal(build({ preferences: ["Music festivals"] }).plan, null);
  assert.throws(() =>
    mergeIntent(result.intent, { requiredRoles: ["invented"] }),
  );
  assert.equal(
    interpretPreferences({ notes: "don't like fancy dinner" }).upscaleMeal,
    false,
  );
  const negated = interpretPreferences({
    notes: "no fancy dinner, no speakeasy",
  });
  const ai = {
    ...interpretPreferences({ notes: "fancy dinner and speakeasy" }),
  };
  const merged = mergeIntent(negated, ai);
  assert.equal(merged.upscaleMeal, false);
  assert.equal(merged.hiddenBars, false);
});
test("explicit evening matcha can fit published café hours after the bookshop closes", () => {
  const result = build({
    notes: "matcha and books",
    date: "2026-10-17",
    time: "18:00",
    timeExplicit: true,
  });
  feasible(result);
  assert.deepEqual(result.plan.sequence, ["bookshop", "cafe"]);
  assert.equal(result.plan.stops[1].name, "MATCHA-YA");
  assert.equal(result.prefs.time, "18:00");
});
test("opening windows, known closures, area and total duration remain hard constraints", () => {
  const result = build({
    notes: "fine dining",
    budget: 200,
    time: "23:30",
    timeExplicit: true,
  });
  assert.equal(result.plan, null);
  assert.equal(
    build({
      area: "Newtown",
      notes: "speakeasies and fine dining",
      budget: 200,
    }).plan,
    null,
  );
  assert.equal(
    build({ notes: "speakeasies and fancy dinner", budget: 170, duration: 3 })
      .plan,
    null,
  );
  const prefs = {
    ...defaultDraft(),
    date: "2026-12-25",
    time: "18:00",
    budget: 200,
  };
  const intent = interpretPreferences({ ...prefs, notes: "fine dining" });
  const bistecca = sydneyVenues.find((v) => v.id === "sydney-bistecca");
  assert.equal(venueRejection(bistecca, prefs, intent), "hours");
  assert.equal(
    schedule(
      [bistecca],
      prefs,
      [[{ minutes: 0, distance: 0, source: "estimate" }]],
      [0],
    ),
    null,
  );
  assert.equal(
    venueRejection(
      sydneyVenues.find((v) => v.id === "sydney-hubert"),
      prefs,
      intent,
    ),
    "unknown-hours",
  );
  const art = sydneyVenues.find((v) => v.id === "sydney-art-gallery");
  assert.equal(
    venueRejection(
      art,
      { ...prefs, date: "2027-03-26", time: "11:00" },
      interpretPreferences(prefs),
    ),
    "hours",
  );
});
test("swaps preserve other identities and reasons, reschedule, and never repeat rejected places", () => {
  const result = build({ area: "Newtown", notes: "matcha and thrifting" });
  let plan = result.plan;
  const originals = plan.stops.filter((_, i) => i !== 1);
  for (let n = 0; n < 2; n++) {
    const next = replaceExperienceStop(
      plan,
      1,
      result.candidates,
      result.prefs,
      result.matrix,
    );
    assert.ok(next);
    assert.ok(next.rejectedIds.includes(plan.stops[1].id));
    assert.ok(!next.rejectedIds.includes(next.stops[1].id));
    assert.deepEqual(
      next.stops.filter((_, i) => i !== 1).map((v) => [v.id, v.reason]),
      originals.map((v) => [v.id, v.reason]),
    );
    assert.ok(
      next.cost <= result.prefs.budget &&
        next.elapsed <= result.prefs.duration * 60,
    );
    plan = { ...plan, ...next };
  }
  assert.equal(
    replaceExperienceStop(
      plan,
      1,
      result.candidates,
      result.prefs,
      result.matrix,
    ),
    null,
  );
  const edited = editRoute(
    plan.stops,
    result.prefs,
    result.candidates,
    result.matrix,
  );
  assert.deepEqual(
    edited.stops.map((v) => v.reason),
    plan.stops.map((v) => v.reason),
  );
});
test("regeneration chooses a different feasible venue set, with no fabricated data", () => {
  const first = build({ area: "Newtown", notes: "matcha and thrifting" });
  const sig = first.plan.stops
    .map((v) => v.id)
    .sort()
    .join("|");
  const other = build({ area: "Newtown", notes: "matcha and thrifting" }, sig);
  feasible(other);
  assert.notEqual(
    other.plan.stops
      .map((v) => v.id)
      .sort()
      .join("|"),
    sig,
  );
  for (const venue of sydneyVenues) {
    assert.ok(
      venue.sources.length &&
        venue.sources.every((s) => /^https:\/\//.test(s.url)),
    );
    assert.equal(venue.rating, undefined);
    assert.equal(venue.image, undefined);
    assert.equal(venue.coordinatesStatus, "approximate");
    assert.equal(venue.priceStatus, "estimate");
  }
});
test("atmosphere and preferences can outweigh a higher review score", () => {
  const prefs = { ...defaultDraft(), notes: "romantic speakeasy" };
  const intent = interpretPreferences(prefs),
    original = sydneyVenues.find((v) => v.id === "sydney-apollonia");
  const suitable = scoreVenue({ ...original, rating: 4 }, prefs, intent);
  const mismatch = scoreVenue(
    { ...original, atmosphere: ["lively"], tags: ["Coffee shops"], rating: 5 },
    prefs,
    intent,
  );
  assert.ok(suitable.score > mismatch.score);
});
test("early-morning bar visits can use the previous day's overnight hours", () => {
  const prefs = {
    ...defaultDraft(),
    date: "2026-10-18",
    time: "01:00",
    timeExplicit: true,
  };
  const bar = sydneyVenues.find((v) => v.id === "sydney-baxter");
  const plan = schedule(
    [bar],
    prefs,
    [[{ minutes: 0, distance: 0, source: "estimate" }]],
    [0],
  );
  assert.ok(plan);
  assert.equal(plan.stops[0].arrival, 60);
});
