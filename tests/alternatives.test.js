import test from "node:test";
import assert from "node:assert/strict";
import { defaultDraft } from "../src/data/preferences.js";
import { curatedVenuesForDate } from "../src/data/sydneyVenues.js";
import {
  interpretPreferences,
  resolvePlanningTime,
} from "../src/engine/preferences.js";
import { selectCandidates, venueRejection } from "../src/engine/filtering.js";
import { optimiseExperience } from "../src/engine/generation.js";
import { closestExperience } from "../src/engine/alternatives.js";
import { demoMatrix, schedule } from "../src/utils/planner.js";

function build(overrides, catalogue) {
  let prefs = { ...defaultDraft(), date: "2026-10-18", ...overrides };
  const intent = interpretPreferences(prefs);
  prefs = resolvePlanningTime(prefs, intent).prefs;
  const all = catalogue || curatedVenuesForDate(prefs.date);
  const exact = selectCandidates(all, prefs, intent);
  const strict = optimiseExperience(
    exact,
    prefs,
    demoMatrix(exact, prefs.transport),
    intent,
  );
  const candidates = selectCandidates(all, prefs, {
    ...intent,
    allowAlternatives: true,
  });
  const matrix = demoMatrix(candidates, prefs.transport);
  const plan = closestExperience(candidates, prefs, matrix, intent);
  return { prefs, intent, candidates, matrix, strict, plan };
}
function feasible({ plan, prefs, candidates, matrix }) {
  assert.ok(plan);
  assert.ok(plan.cost <= prefs.budget);
  assert.ok(plan.elapsed <= prefs.duration * 60);
  assert.ok(
    plan.stops.every(
      (v) => v.source === "curated" && (v.weeklyHours || v.hours),
    ),
  );
  assert.ok(
    schedule(
      plan.stops,
      prefs,
      matrix,
      plan.stops.map((s) => candidates.findIndex((v) => v.id === s.id)),
    ),
  );
  assert.equal(
    plan.requestedIntent.requiredTags.length > 0 ||
      plan.requestedIntent.requiredRoles.length > 0,
    true,
  );
}

test("closed shopping windows produce an open bookshop alternative at the chosen time", () => {
  const result = build({
    area: "Newtown",
    preferences: ["Thrifting"],
    time: "18:00",
    timeExplicit: true,
  });
  assert.equal(result.strict, null);
  feasible(result);
  assert.ok(result.plan.stops.some((v) => v.activityRole === "bookshop"));
  assert.ok(result.plan.stops.every((v) => v.activityRole !== "shop"));
  assert.equal(result.prefs.time, "18:00");
  assert.equal(result.prefs.date, "2026-10-18");
  assert.match(result.plan.matchNotice, /Bookshops instead of Thrifting/);
  assert.deepEqual(result.prefs.preferences, ["Thrifting"]);
});
test("a unavailable market day retains matcha and finds a related browsing stop", () => {
  const result = build({ preferences: ["Flea markets", "Matcha cafés"] });
  assert.equal(result.strict, null);
  feasible(result);
  assert.ok(result.plan.stops.some((v) => v.tags.includes("Matcha cafés")));
  assert.ok(result.plan.stops.some((v) => v.activityRole === "bookshop"));
  assert.ok(!result.plan.stops.some((v) => v.id === "sydney-glebe-markets"));
  assert.deepEqual(result.plan.intent.requiredTags, ["Matcha cafés"]);
  assert.match(result.plan.matchNotice, /instead of Flea markets/);
});
test("an unaffordable fine-dining request uses a cheaper alternative without claiming it is fine dining", () => {
  const result = build({ notes: "fine dining", budget: 20 });
  assert.equal(result.strict, null);
  feasible(result);
  assert.ok(!result.plan.stops.some((v) => v.upscale));
  assert.equal(result.plan.intent.upscaleMeal, false);
  assert.match(result.plan.matchNotice, /instead of Fine dining/);
  assert.ok(
    result.plan.stops.every(
      (v) => !v.reason.includes("The upscale dinner you asked for"),
    ),
  );
});
test("alternatives still exclude closed/unknown venues, explicit dislikes, and rejected spots", () => {
  const result = build({ notes: "fine dining, no bars", budget: 20 });
  feasible(result);
  assert.ok(result.plan.stops.every((v) => v.activityRole !== "bar"));
  const source = result.candidates[0];
  const intent = { ...result.intent, allowAlternatives: true };
  assert.equal(
    venueRejection(
      { ...source, weeklyHours: undefined, hours: undefined },
      result.prefs,
      intent,
    ),
    "unknown-hours",
  );
  assert.equal(
    venueRejection(
      { ...source, closedDates: [result.prefs.date] },
      result.prefs,
      intent,
    ),
    "hours",
  );
  assert.equal(
    venueRejection(source, result.prefs, intent, [source.id]),
    "rejected",
  );
  assert.equal(
    build({ notes: "fine dining, no bars", time: "23:30", timeExplicit: true })
      .plan,
    null,
  );
});
test("retaining an exact interest wins over padding with unrelated cheaper stops", () => {
  const result = build({ preferences: ["Fine dining"], budget: 120 });
  feasible(result);
  assert.ok(result.plan.stops.some((v) => v.tags.includes("Fine dining")));
  assert.ok(!result.plan.matchNotice.includes("instead of Fine dining"));
});

test("regeneration does not trade the closest browsing alternative for an unrelated activity", () => {
  // Preserve the original single-signature fixture. Expanded-catalogue
  // regeneration is covered separately in catalogue-expansion.test.js.
  const originalIds = new Set([
    "glebe-markets", "kinokuniya", "matchaya", "burrow", "baxter", "apollonia",
    "bistecca", "gidley", "hubert", "art-gallery", "state-library", "library-cafe",
    "botanic-garden", "mamak", "maeda", "uturn-vintage", "uturn-contemporary",
    "route66", "better-read", "soul-burger", "mapo",
  ].map((id) => `sydney-${id}`));
  const originalCatalogue = curatedVenuesForDate("2026-10-18").filter((v) => originalIds.has(v.id));
  assert.equal(originalCatalogue.length, 21);
  const result = build({
    area: "Newtown",
    preferences: ["Thrifting"],
    time: "18:00",
    timeExplicit: true,
  }, originalCatalogue);
  const excludeSignature = result.plan.stops
    .map((v) => v.id)
    .sort()
    .join("|");
  const next = closestExperience(
    result.candidates,
    result.prefs,
    result.matrix,
    result.intent,
    { excludeSignature },
  );
  assert.deepEqual(
    next.stops.map((v) => v.id),
    result.plan.stops.map((v) => v.id),
  );
  assert.match(next.matchNotice, /Bookshops instead of Thrifting/);
});
