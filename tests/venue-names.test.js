import test from "node:test";
import assert from "node:assert/strict";
import {
  normalisePlanNames,
  normaliseRouteNames,
  normaliseVenueName,
} from "../src/utils/venueNames.js";

test("old saved demo routes use place labels without changing routing or budget", () => {
  const oldVenue = {
    id: "newtown-0",
    source: "demo",
    name: "a little matcha moment",
    lat: -33.8995,
    lng: 151.1764,
    arrival: 660,
    cost: 12,
    mins: 40,
  };
  const route = {
    plan: {
      id: "kept",
      stops: [oldVenue],
      cost: 12,
      elapsed: 40,
      prefs: { area: "Newtown" },
    },
    candidates: [oldVenue],
    matrix: [[{ minutes: 0, source: "estimate" }]],
  };
  const updated = normaliseRouteNames(route);
  assert.equal(updated.plan.stops[0].name, "Matcha café, Newtown");
  assert.equal(updated.candidates[0].name, updated.plan.stops[0].name);
  assert.deepEqual({ ...updated.plan.stops[0], name: oldVenue.name }, oldVenue);
  assert.equal(updated.plan.id, route.plan.id);
  assert.equal(updated.plan.cost, route.plan.cost);
  assert.equal(updated.plan.elapsed, route.plan.elapsed);
  assert.equal(updated.matrix, route.matrix);
  assert.equal(route.plan.stops[0].name, "a little matcha moment");
});

test("live venue names and user-customised labels remain intact", () => {
  for (const stop of [
    { id: "newtown-0", source: "google", name: "LAMBERT Matcha, Shinjuku" },
    { id: "newtown-0", source: "demo", name: "my saved café" },
    { id: "unknown", source: "demo", name: "a little matcha moment" },
  ])
    assert.equal(normaliseVenueName(stop), stop);
  assert.equal(normalisePlanNames(null), null);
});
