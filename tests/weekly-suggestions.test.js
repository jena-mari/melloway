import test from "node:test";
import assert from "node:assert/strict";
import { weeklyEditions, weeklyEdition, weeklyMatches, weeklyDateLabel, weeklyPlanPatch, findWeeklySuggestion } from "../src/data/weeklySuggestions.js";

test("weekly editions switch on publication day and never leak future highlights", () => {
  const original = weeklyEditions[0];
  const next = { weekOf: "2026-10-12", suggestions: [{ id: "next-week" }] };
  const editions = [next, original];
  assert.equal(weeklyEdition("2026-10-11", editions), original);
  assert.equal(weeklyEdition("2026-10-12", editions), next);
  assert.equal(weeklyEdition("2026-10-04", editions), null);
  assert.equal(weeklyEdition("2026-02-30", editions), null);
  assert.equal(weeklyEdition("2026-10-19", [original]), original);
  assert.equal(weeklyDateLabel(original), "5 Oct – 11 Oct");
  assert.deepEqual(editions, [next, original]);
  assert.equal(findWeeklySuggestion("next-week", "2026-10-11", editions), null);
  assert.equal(findWeeklySuggestion("macquarie-ice-rink", "2026-10-12", editions), original.suggestions[0]);
});

test("suggestions match searches and interests without treating unknown prices as free", () => {
  const edition = weeklyEditions[0];
  const original = JSON.stringify(edition);
  assert.equal(weeklyMatches(edition, { preferences: ["Arcades"] })[0].id, "astros-arcade-bar");
  assert.equal(weeklyMatches(edition, { preferences: ["Live music"] })[0].id, "caterpillar-club");
  assert.equal(weeklyMatches(edition, { budget: 0 })[2].id, "macquarie-ice-rink");
  assert.equal(weeklyMatches(edition, {}, "North Ryde")[0].id, "macquarie-ice-rink");
  assert.equal(weeklyMatches(edition, {}, "92 Pitt")[0].id, "caterpillar-club");
  assert.equal(weeklyMatches(edition, {}, "Astro's")[0].id, "astros-arcade-bar");
  assert.deepEqual(weeklyMatches(edition, {}, "nonexistent"), []);
  assert.equal(edition.suggestions[1].knownCost, null);
  assert.equal(JSON.stringify(edition), original);
});

test("planning around a weekly suggestion preserves other answers and does not duplicate the request", () => {
  const item = weeklyEditions[0].suggestions[1];
  const prefs = { name: "Jena", preferences: ["Desserts", "Arcades"], notes: "Vegetarian please.", date: "2026-10-16", time: "18:00", budget: 45 };
  const original = structuredClone(prefs);
  const next = { ...prefs, ...weeklyPlanPatch(item, prefs) };
  assert.deepEqual(prefs, original);
  assert.equal(next.budget, 45);
  assert.equal(next.date, prefs.date);
  assert.equal(next.time, prefs.time);
  assert.equal(next.area, "Newtown");
  assert.equal(next.location, null);
  assert.deepEqual(next.preferences, ["Desserts", "Arcades"]);
  assert.match(next.notes, /Vegetarian please\.[\s\S]*Astro’s Arcade Bar, 22 King St/);
  assert.equal(weeklyPlanPatch(item, next).notes, next.notes);
});
