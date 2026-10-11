import test from "node:test";
import assert from "node:assert/strict";
import {
  interestsFromNotes,
  preferencesForPlan,
} from "../src/utils/interests.js";
import { validPreferences } from "../src/utils/planner.js";
import { defaultDraft } from "../src/data/preferences.js";
import { interpretPreferences, resolvePlanningTime } from "../src/engine/preferences.js";
test("wireframe-style notes contribute recognised interests", () => {
  const parsed = interestsFromNotes(
    "my girl loves chicken adobo, matcha, flea markets and vintage finds. we want a photobooth too.",
  );
  for (const tag of [
    "Asian food",
    "Matcha cafés",
    "Flea markets",
    "Vintage stores",
    "Photo booths",
  ])
    assert.ok(parsed.included.includes(tag));
});
test("explicit exclusions override suggestions and selected chips", () => {
  const draft = {
    ...defaultDraft(),
    idea: "books-coffee",
    preferences: ["Coffee shops", "Art galleries"],
    notes:
      "no coffee please, but we love matcha. avoid live music and don't want jazz.",
  };
  const result = preferencesForPlan(draft);
  assert.ok(!result.includes("Coffee shops"));
  assert.ok(result.includes("Bookshops"));
  assert.ok(result.includes("Matcha cafés"));
  assert.ok(result.includes("Art galleries"));
  assert.deepEqual(
    interestsFromNotes(draft.notes).excluded.sort(),
    ["Coffee shops", "Jazz bars", "Live music"].sort(),
  );
});
test("notes do not mutate chip answers and unknown requests remain notes", () => {
  const draft = {
    ...defaultDraft(),
    preferences: ["Museums"],
    notes: "a table by the window and coffee",
  };
  assert.deepEqual(preferencesForPlan(draft), ["Museums", "Coffee shops"]);
  assert.deepEqual(draft.preferences, ["Museums"]);
  assert.equal(draft.notes, "a table by the window and coffee");
  assert.equal(validPreferences({ ...draft, notes: 42 }), false);
  assert.equal(validPreferences({ ...draft, notes: "a".repeat(1201) }), false);
});

test("chosen vibes influence activities and atmosphere while exclusions and chosen times win", () => {
  const draft = { ...defaultDraft(), idea: "books-art", ideaExplicit: true };
  const interests = preferencesForPlan(draft);
  assert.ok(interests.includes("Bookshops"));
  assert.ok(interests.includes("Museums"));
  assert.ok(interests.includes("Art galleries"));
  const quiet = interpretPreferences({ ...draft, preferences: interests });
  assert.ok(quiet.atmosphere.includes("quiet"));
  assert.ok(quiet.atmosphere.includes("creative"));
  const excluded = preferencesForPlan({ ...draft, notes: "no museums" });
  assert.ok(!excluded.includes("Museums"));
  assert.ok(excluded.includes("Bookshops"));
  const wine = { ...defaultDraft(), idea: "wine-dinner", ideaExplicit: true, timeExplicit: false };
  const intent = interpretPreferences({ ...wine, preferences: preferencesForPlan(wine) });
  assert.equal(intent.period, "evening");
  assert.deepEqual(intent.requiredRoles.sort(), ["bar", "meal"]);
  assert.equal(resolvePlanningTime(wine, intent).prefs.time, "18:00");
  assert.equal(resolvePlanningTime({ ...wine, time: "13:00", timeExplicit: true }, intent).prefs.time, "13:00");
  assert.equal(interpretPreferences({ idea: "homebody-cozy", ideaExplicit: true }).pace, "slow");
  assert.ok(interpretPreferences({ idea: "live-music", ideaExplicit: true }).atmosphere.includes("lively"));
});
