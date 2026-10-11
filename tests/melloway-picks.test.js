import test from "node:test";
import assert from "node:assert/strict";
import {
  mellowayPicks,
  matchingPicks,
  nextPickDate,
  pickRoute,
} from "../src/data/mellowayPicks.js";
import { defaultDraft } from "../src/data/preferences.js";
import { editRoute, validPreferences } from "../src/utils/planner.js";

const pick = mellowayPicks[0];
test("editorial matcha crawl keeps exact branches, order and supplied arrival times", () => {
  const route = pickRoute(pick, "2026-10-12");
  assert.ok(validPreferences(route.plan.prefs));
  assert.deepEqual(
    route.plan.stops.map((stop) => stop.name),
    [
      "Outta Coffee",
      "Issho Cafe",
      "Matcha-Ya",
      "The Sneaker Laundry",
      "Chubby Cubby Cafe",
    ],
  );
  assert.deepEqual(
    route.plan.stops.map((stop) => stop.arrival),
    [630, 675, 720, 765, 810],
  );
  assert.match(route.plan.stops[3].address, /^303 Pitt St/);
  assert.match(route.plan.stops[4].address, /Westfield Sydney, Level 1/);
  assert.equal(route.plan.travel, 41);
  assert.equal(route.plan.elapsed, 225);
  assert.ok(route.plan.cost <= route.plan.prefs.budget);
  assert.equal(route.plan.source, "estimate");
  assert.match(route.plan.notice, /not live pedestrian routing/);
  assert.equal(route.plan.stops[0].hoursStatus, "reported");
  assert.equal(route.plan.stops[3].hoursStatus, "reported");
});

test("hours and invalid dates constrain fixed picks without substituting another branch", () => {
  assert.equal(pickRoute(pick, "2026-10-11"), null); // Pitt Street Sunday hours unconfirmed.
  assert.equal(nextPickDate(pick, "2026-10-11"), "2026-10-12");
  assert.ok(pickRoute(pick, "2026-10-17"));
  assert.equal(pickRoute(pick, "2026-02-30"), null);
  assert.equal(pickRoute(pick, ""), null);
  assert.equal(pickRoute({ ...pick, time: "09:00" }, "2026-10-12"), null);
  const early = pickRoute(
    { ...pick, time: "09:00", duration: 6 },
    "2026-10-12",
  );
  assert.ok(early.plan.stops[2].arrival >= 720);
});

test("building and editing a personal copy cannot mutate the source pick or draft", () => {
  const original = JSON.stringify(pick),
    draft = defaultDraft(),
    originalDraft = JSON.stringify(draft);
  const route = pickRoute(pick, "2026-10-12");
  const edited = editRoute(
    route.plan.stops.filter((stop) => stop.id !== "pick-matcha-issho"),
    route.plan.prefs,
    route.candidates,
    route.matrix,
  );
  assert.equal(edited.stops.length, 4);
  assert.ok(
    edited.stops.find((stop) => stop.id === "pick-matcha-matchaya").arrival >=
      720,
  );
  route.plan.stops[0].name = "Personal copy";
  route.candidates[1].weeklyHours[1][0].open = 0;
  assert.equal(JSON.stringify(pick), original);
  assert.equal(JSON.stringify(draft), originalDraft);
  assert.equal(
    pickRoute(pick, "2026-10-12").plan.stops[0].name,
    "Outta Coffee",
  );
});

test("saved pick IDs are stable per day and search includes branches and the brand", () => {
  const first = pickRoute(pick, "2026-10-12").plan.id;
  assert.equal(first, pickRoute(pick, "2026-10-12").plan.id);
  assert.notEqual(first, pickRoute(pick, "2026-10-13").plan.id);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(matchingPicks("@melloway")[0].id, pick.id);
  assert.equal(matchingPicks("303")[0].id, pick.id);
  assert.equal(matchingPicks("Westfield")[0].id, pick.id);
  assert.equal(matchingPicks("Sneaker Laundry")[0].id, pick.id);
  assert.equal(matchingPicks("nonexistent").length, 0);
});
