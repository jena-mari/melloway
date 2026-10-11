import test from "node:test";
import assert from "node:assert/strict";
import { defaultDraft } from "../src/data/preferences.js";
import {
  allocateActivityBudgets,
  validActivityBudgets,
} from "../src/utils/activityBudget.js";
import {
  schedule,
  demoMatrix,
  editRoute,
  addStop,
  replaceStop,
  validPreferences,
} from "../src/utils/planner.js";
import { selectCandidates } from "../src/engine/filtering.js";
import { interpretPreferences } from "../src/engine/preferences.js";
import { optimiseExperience } from "../src/engine/generation.js";

const place = (id, role, cost, tags = []) => ({
  id,
  name: id,
  roles: [role],
  activityRole: role,
  category: role,
  cost,
  tags,
  source: "curated",
  lat: -33.872,
  lng: 151.208,
  mins: 30,
  hours: { open: 0, close: 1440 },
  score: 50,
});
const stops = [
  place("meal", "meal", 30),
  place("coffee", "cafe", 12),
  place("shop", "shop", 0),
  place("books", "bookshop", 0),
];
const prefs = {
  ...defaultDraft(),
  date: "2026-10-18",
  time: "12:00",
  budget: 100,
};

test("automatic activity allowances preserve estimates, reserve purchase money and leave a buffer", () => {
  const plan = schedule(
    stops,
    { ...prefs, transport: "Public transport" },
    demoMatrix(stops, "Public transport"),
    [0, 1, 2, 3],
  );
  assert.ok(plan);
  assert.equal(plan.transportAllowance, 10);
  assert.equal(plan.budgetBreakdown.food.allowance, 30);
  assert.equal(plan.budgetBreakdown.drinks.allowance, 12);
  assert.equal(plan.budgetBreakdown.shopping.allowance, 24);
  assert.equal(plan.cost, 76);
  assert.equal(plan.budgetUnassigned, 24);
  assert.deepEqual(
    plan.stops.map((s) => s.estimatedCost),
    [30, 12, 0, 0],
  );
  assert.deepEqual(
    plan.stops.slice(2).map((s) => s.cost),
    [18, 6],
  );
  assert.equal(stops[2].cost, 0);
});
test("custom categories are shared across repeated stops and include transport in the full ceiling", () => {
  const d = {
    ...prefs,
    transport: "Public transport",
    activityBudgets: { food: 40, drinks: 15, shopping: 35, activities: 0 },
  };
  const result = allocateActivityBudgets(stops, d, 10);
  assert.equal(result.cost, 100);
  assert.equal(result.budgetAllocated, 100);
  assert.equal(result.budgetUnassigned, 0);
  assert.equal(result.stops[2].cost + result.stops[3].cost, 35);
  assert.equal(
    allocateActivityBudgets(stops, { ...d, activityBudgets: { food: 20 } }, 10),
    null,
  );
  assert.equal(
    validPreferences({ ...d, activityBudgets: { food: 95 } }),
    false,
  );
});
test("reserved budgets for future categories cannot be spent by extras", () => {
  const d = { ...prefs, budget: 80, activityBudgets: { shopping: 68 } };
  const candidates = stops.slice(0, 2);
  const matrix = demoMatrix(candidates, "Walking");
  const plan = { ...schedule([candidates[1]], d, matrix, [1]), prefs: d };
  assert.equal(plan.cost, 12);
  assert.equal(plan.budgetUnassigned, 0);
  assert.equal(addStop(plan, candidates[0], candidates, matrix), null);
});
test("adding an extra cannot silently reduce an existing automatic shopping allowance", () => {
  const d = { ...prefs, budget: 80 };
  const chosen = stops.slice(1);
  const extra = place("dessert", "dessert", 10);
  const candidates = [...chosen, extra];
  const matrix = demoMatrix(candidates, "Walking");
  const original = { ...schedule(chosen, d, matrix, [0, 1, 2]), prefs: d };
  const added = addStop(original, extra, candidates, matrix);
  assert.equal(
    added.budgetBreakdown.shopping.allowance,
    original.budgetBreakdown.shopping.allowance,
  );
  assert.equal(added.cost, original.cost + 10);
  assert.equal(
    addStop(
      { ...original, prefs: { ...d, budget: original.cost } },
      extra,
      candidates,
      matrix,
    ),
    null,
  );
});
test("route edits recalculate allowances from original estimates instead of compounding shopping money", () => {
  const matrix = demoMatrix(stops, "Walking");
  const plan = schedule(stops, prefs, matrix, [0, 1, 2, 3]);
  const again = editRoute(plan.stops, prefs, stops, matrix);
  assert.deepEqual(
    again.stops.map((s) => s.cost),
    plan.stops.map((s) => s.cost),
  );
  assert.equal(again.cost, plan.cost);
  const custom = { ...prefs, activityBudgets: { shopping: 40 } };
  const removed = editRoute(plan.stops.slice(0, 3), custom, stops, matrix);
  assert.equal(removed.stops[2].cost, 40);
  assert.equal(removed.stops[2].estimatedCost, 0);
  assert.equal(removed.budgetBreakdown.shopping.allowance, 40);
});
test("changing a shopping spot keeps the category allowance and the other stop budgets", () => {
  const d = { ...prefs, budget: 80 };
  const chosen = stops.slice(1);
  const replacement = place("another shop", "shop", 0);
  const candidates = [...chosen, replacement];
  const matrix = demoMatrix(candidates, "Walking");
  const original = schedule(chosen, d, matrix, [0, 1, 2]);
  const next = replaceStop(original, 1, candidates, d, matrix);
  assert.ok(next);
  assert.equal(
    next.budgetBreakdown.shopping.allowance,
    original.budgetBreakdown.shopping.allowance,
  );
  assert.deepEqual(
    next.stops.map((s) => s.cost),
    original.stops.map((s) => s.cost),
  );
  assert.equal(next.stops[1].estimatedCost, 0);
});
test("cent arithmetic, free browsing and malformed caps do not overspend", () => {
  const d = {
    ...prefs,
    budget: 80.03,
    activityBudgets: { shopping: 20.01, drinks: 12.01 },
  };
  const result = allocateActivityBudgets(stops.slice(1), d);
  assert.equal(result.cost, 32.02);
  assert.equal(result.budgetUnassigned, 48.01);
  assert.equal(
    allocateActivityBudgets(stops.slice(2), { ...prefs, budget: 0 }).cost,
    0,
  );
  for (const invalid of [
    null,
    [],
    { madeUp: 10 },
    { food: "10" },
    { shopping: -1 },
    { food: 0.001 },
    { drinks: Infinity },
  ])
    assert.equal(validActivityBudgets(invalid), false);
  assert.equal(
    allocateActivityBudgets([{ ...stops[0], cost: "30" }], prefs),
    null,
  );
  assert.equal(
    allocateActivityBudgets([{ ...stops[0], cost: -0.001 }], prefs),
    null,
  );
});
test("a café can be selected as dessert when food fits but the drinks budget is zero", () => {
  const venue = {
    ...place("dessert", "cafe", 12, ["Desserts"]),
    activityRole: undefined,
    roles: ["cafe", "dessert"],
  };
  const d = {
    ...prefs,
    preferences: ["Desserts"],
    activityBudgets: { drinks: 0, food: 15 },
  };
  const intent = interpretPreferences(d);
  const candidates = selectCandidates([venue], d, intent);
  assert.equal(candidates.length, 1);
  const plan = optimiseExperience(
    candidates,
    d,
    demoMatrix(candidates, "Walking"),
    intent,
    { templates: [["dessert"]] },
  );
  assert.ok(plan);
  assert.equal(plan.stops[0].budgetCategory, "food");
  assert.equal(plan.stops[0].cost, 15);
});
