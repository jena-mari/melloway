import test from "node:test";
import assert from "node:assert/strict";
import { venues } from "../src/data/venues.js";
import { defaultDraft } from "../src/data/preferences.js";
import {
  selectVenues,
  demoMatrix,
  optimise,
  replaceStop,
  schedule,
  km,
  editRoute,
  addStop,
  directions,
} from "../src/utils/planner.js";
function bundle(overrides = {}) {
  const prefs = { ...defaultDraft(), ...overrides };
  const c = selectVenues(venues, prefs),
    m = demoMatrix(c, prefs.transport);
  return { prefs, c, m, p: optimise(c, prefs, m) };
}
test("budget and duration are hard constraints, including free outings", () => {
  for (const budget of [0, 20, 50, 80]) {
    const { p, prefs } = bundle({ budget });
    assert.ok(p);
    assert.ok(p.cost <= budget);
    assert.ok(p.elapsed <= prefs.duration * 60);
    assert.ok(p.stops.length >= 3);
  }
});

test("manual removal and reordering recalculate arrival, costs and connecting legs", () => {
  const prefs = { ...defaultDraft(), budget: 100, duration: 3 };
  const c = ["a", "b", "c"].map((id, i) => ({
    id,
    name: id,
    cost: 10 * (i + 1),
    mins: 20,
    tags: [],
    lat: -33.88 + i * 0.001,
    lng: 151.2,
    hours: { open: 0, close: 1440 },
  }));
  const m = [
    [0, 5, 17],
    [11, 0, 7],
    [13, 19, 0],
  ].map((row) =>
    row.map((minutes) => ({
      minutes,
      distance: minutes / 10,
      source: "google",
    })),
  );
  const removed = editRoute([c[0], c[2]], prefs, c, m);
  assert.equal(removed.cost, 40);
  assert.equal(removed.elapsed, 57);
  assert.equal(removed.stops[1].arrival, 697);
  assert.equal(removed.stops[1].travelFromPrevious.minutes, 17);
  const reordered = editRoute([c[2], c[0], c[1]], prefs, c, m);
  assert.deepEqual(
    reordered.stops.map((s) => s.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    reordered.stops.map((s) => s.arrival),
    [660, 693, 718],
  );
  assert.equal(reordered.cost, 60);
  const single = editRoute([c[1]], prefs, c, m);
  assert.equal(single.cost, 20);
  assert.equal(single.travel, 0);
  assert.equal(single.source, "estimate");
  assert.match(directions(single.stops, prefs.transport), /maps\/search\//);
});

test("manual changes reject empty, duplicate, missing and infeasible stops", () => {
  const { prefs, c, m, p } = bundle();
  assert.equal(editRoute([], prefs, c, m), null);
  assert.equal(editRoute([c[0], c[0]], prefs, c, m), null);
  assert.equal(editRoute([{ ...c[0], id: "missing" }], prefs, c, m), null);
  assert.equal(
    editRoute([c.find((v) => v.cost > 0)], { ...prefs, budget: 0 }, c, m),
    null,
  );
  assert.equal(editRoute(p.stops, { ...prefs, time: "23:30" }, c, m), null);
  const broken = m.map((row) => row.map((leg) => ({ ...leg, minutes: null })));
  assert.equal(editRoute(p.stops, prefs, c, broken), null);
});

test("optional additions find a feasible insertion without reordering existing stops", () => {
  const prefs = { ...defaultDraft(), budget: 80, duration: 3 };
  const c = ["food", "shop", "booth"].map((id, i) => ({
    id,
    name: id,
    cost: 10,
    mins: i === 2 ? 15 : 30,
    hours: { open: 0, close: 1440 },
  }));
  const m = [
    [0, 8, 4],
    [8, 0, 16],
    [16, 4, 0],
  ].map((row) =>
    row.map((minutes) => ({ minutes, distance: 1, source: "estimate" })),
  );
  const plan = { ...editRoute(c.slice(0, 2), prefs, c, m), prefs };
  const next = addStop(plan, c[2], c, m);
  assert.deepEqual(
    next.stops.map((s) => s.id),
    ["food", "booth", "shop"],
  );
  assert.equal(next.cost, 30);
  assert.equal(next.elapsed, 83);
  assert.deepEqual(
    next.stops.filter((s) => s.id !== "booth").map((s) => s.id),
    ["food", "shop"],
  );
  assert.equal(
    addStop({ ...plan, prefs: { ...prefs, budget: 20 } }, c[2], c, m),
    null,
  );
  assert.equal(addStop(plan, c[0], c, m), null);
  assert.equal(
    addStop(
      plan,
      { ...c[2], hours: { open: 0, close: 600 } },
      c.map((v, i) => (i === 2 ? { ...v, hours: { open: 0, close: 600 } } : v)),
      m,
    ),
    null,
  );
});
test("preferences affect venue selection", () => {
  const a = bundle({ preferences: ["Matcha cafés", "Desserts"] });
  const b = bundle({ preferences: ["Art galleries", "Museums"] });
  assert.notDeepEqual(
    a.p.stops.map((v) => v.id),
    b.p.stops.map((v) => v.id),
  );
  assert.ok(a.p.stops.some((v) => v.tags.includes("Matcha cafés")));
  assert.ok(b.p.stops.some((v) => v.tags.includes("Museums")));
});
test("geographic area filters and transport edges are respected", () => {
  const a = bundle({ area: "Newtown" });
  assert.ok(a.p);
  assert.ok(
    a.p.stops.every((v) => km(v, { lat: -33.8965, lng: 151.1794 }) <= 2),
  );
  const c = a.c;
  assert.notDeepEqual(demoMatrix(c, "Walking"), demoMatrix(c, "Driving"));
});
test("replacement preserves every other stop and budget", () => {
  const { p, prefs, c, m } = bundle();
  const next = replaceStop(p, 1, c, prefs, m);
  assert.ok(next);
  assert.notEqual(next.stops[1].id, p.stops[1].id);
  p.stops.forEach((v, i) => {
    if (i !== 1) assert.equal(v.id, next.stops[i].id);
  });
  assert.ok(next.cost <= prefs.budget);
});
test("late starts cannot invent availability", () => {
  assert.equal(bundle({ time: "23:30" }).p, null);
});
test("scheduling respects chosen weekday and rejects unavailable route edges", () => {
  const prefs = { ...defaultDraft(), date: "2026-10-10" };
  const v = {
    id: "a",
    cost: 0,
    mins: 30,
    weeklyHours: Array.from({ length: 7 }, () => []),
  };
  assert.equal(schedule([v], prefs, [[{ minutes: 0 }]], [0]), null);
  const x = { ...v, hours: { open: 0, close: 1440 }, weeklyHours: undefined };
  assert.equal(
    schedule([x, x], prefs, [[{ minutes: Infinity }]], [0, 0]),
    null,
  );
});
test("regeneration finds a different feasible combination", () => {
  const { p, prefs, c, m } = bundle();
  const next = optimise(c, prefs, m, {
    excludeSignature: p.stops
      .map((s) => s.id)
      .sort()
      .join("|"),
  });
  assert.ok(next);
  assert.notDeepEqual(
    next.stops.map((s) => s.id).sort(),
    p.stops.map((s) => s.id).sort(),
  );
});
test("overlapping demo areas do not repeat the same experience", () => {
  const { p, c } = bundle({
    area: "Newtown",
    preferences: ["Matcha cafés", "Bookshops"],
  });
  assert.equal(new Set(c.map((v) => v.name)).size, c.length);
  assert.equal(new Set(p.stops.map((v) => v.name)).size, p.stops.length);
});
test("transport allowances remain inside the full budget", () => {
  for (const transport of ["Driving", "Public transport"]) {
    const { p, prefs } = bundle({ transport, budget: 30 });
    assert.ok(p);
    assert.ok(p.cost <= prefs.budget);
    assert.equal(p.transportAllowance, transport === "Driving" ? 15 : 10);
  }
});
test("overnight visits use the outing weekday and can finish after midnight", () => {
  const prefs = {
    ...defaultDraft(),
    date: "2026-10-10",
    time: "23:30",
    duration: 3,
  };
  const v = {
    id: "night",
    name: "late demo",
    tags: [],
    cost: 0,
    mins: 60,
    weeklyHours: Array.from({ length: 7 }, (_, day) =>
      day === 6 ? [{ open: 1320, close: 1560 }] : [],
    ),
  };
  const plan = schedule(
    [v],
    prefs,
    [[{ minutes: 0, source: "estimate" }]],
    [0],
  );
  assert.ok(plan);
  assert.equal(plan.stops[0].arrival, 1410);
  assert.equal(plan.elapsed, 60);
});
test("invalid planning input and missing route edges cannot produce an itinerary", () => {
  assert.equal(bundle({ area: "unknown" }).p, null);
  assert.equal(bundle({ budget: -5 }).p, null);
  assert.equal(bundle({ date: "2026-02-30" }).p, null);
  const { c, prefs } = bundle();
  assert.equal(schedule(c.slice(0, 3), prefs, [], [0, 1, 2]), null);
});

test("a searched location drives the geographic filter without a preset area name", () => {
  const location = {
    id: "test-place",
    name: "A Sydney spot",
    address: "Newtown NSW",
    lat: -33.8965,
    lng: 151.1794,
    r: 1,
    source: "google",
  };
  const custom = bundle({ area: location.name, location });
  assert.ok(custom.c.length >= 3);
  assert.ok(custom.c.every((venue) => km(venue, location) <= 1));
  assert.ok(custom.p);
  assert.equal(
    bundle({ area: location.name, location: { ...location, lat: -37.8 } }).p,
    null,
  );
  assert.equal(
    bundle({ area: location.name, location: { ...location, r: 300 } }).p,
    null,
  );
});
