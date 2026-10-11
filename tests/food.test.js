import test from "node:test";
import assert from "node:assert/strict";
import { defaultDraft } from "../src/data/preferences.js";
import {
  interpretPreferences,
  mergeIntent,
} from "../src/engine/preferences.js";
import { scoreVenue } from "../src/engine/scoring.js";
import { validPreferences } from "../src/utils/planner.js";
import { recommendationInput } from "../server/openai.js";

test("cuisine requests a food stop while dining vibes remain flexible", () => {
  const prefs = {
    ...defaultDraft(),
    preferences: ["Asian food"],
    diningVibes: ["Cozy", "Fancy"],
  };
  const intent = interpretPreferences(prefs);
  assert.deepEqual(intent.requiredRoles, ["meal"]);
  assert.deepEqual(intent.requiredTags, ["Asian food"]);
  assert.deepEqual(intent.diningAtmosphere, [
    "intimate",
    "quiet",
    "upscale",
    "sophisticated",
  ]);
  assert.equal(intent.upscaleMeal, false);
  assert.equal(intent.period, "daytime");
  assert.deepEqual(
    mergeIntent(intent, interpretPreferences(defaultDraft())).diningAtmosphere,
    intent.diningAtmosphere,
  );
  assert.deepEqual(recommendationInput(prefs, []).preferences.diningVibes, [
    "Cozy",
    "Fancy",
  ]);
  assert.equal(
    interpretPreferences({ ...defaultDraft(), diningVibes: ["Fancy"] })
      .requiredRoles.length,
    0,
  );
});

test("dining vibe improves matching food scores without changing shopping scores", () => {
  const prefs = defaultDraft();
  const plain = interpretPreferences(prefs);
  const cozy = interpretPreferences({ ...prefs, diningVibes: ["Cozy"] });
  const venue = {
    tags: ["Asian food"],
    roles: ["meal"],
    cost: 20,
    lat: -33.872,
    lng: 151.208,
    source: "curated",
    atmosphere: ["intimate", "quiet"],
  };
  const lively = { ...venue, atmosphere: ["lively"] };
  assert.ok(
    scoreVenue(venue, prefs, cozy).score >
      scoreVenue(lively, prefs, cozy).score,
  );
  assert.ok(
    scoreVenue(venue, prefs, cozy).score >
      scoreVenue(venue, prefs, plain).score,
  );
  const shop = { ...venue, roles: ["shop"], tags: ["Thrifting"] };
  assert.equal(
    scoreVenue(shop, prefs, cozy).score,
    scoreVenue(shop, prefs, plain).score,
  );
});

test("legacy and skipped dining answers are valid; invalid values are rejected", () => {
  const prefs = defaultDraft();
  const { diningVibes, ...legacy } = prefs;
  assert.equal(validPreferences(legacy), true);
  assert.equal(validPreferences(prefs), true);
  assert.equal(
    validPreferences({ ...prefs, diningVibes: ["Chill", "Outdoors"] }),
    true,
  );
  for (const value of [null, "Cozy", ["made up"], Array(6).fill("Cozy")])
    assert.equal(validPreferences({ ...prefs, diningVibes: value }), false);
});
