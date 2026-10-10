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
