import test from "node:test";
import assert from "node:assert/strict";
import {
  interestsFromNotes,
  preferencesForPlan,
} from "../src/utils/interests.js";
import { validPreferences } from "../src/utils/planner.js";
import { defaultDraft } from "../src/data/preferences.js";
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
