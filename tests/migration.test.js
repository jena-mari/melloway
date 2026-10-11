import test from 'node:test';
import assert from 'node:assert/strict';
import * as legacy from './fixtures/legacy-planner.js';
import * as shared from '@melloway/domain';

const base = { ...shared.defaultDraft(), date: '2026-10-10', transport: 'Walking' };
test('TypeScript planner matches the original output across areas, budgets, modes, seeds and interests', () => {
  for (const overrides of [
    {}, { budget: 0 }, { area: 'Newtown', preferences: ['Matcha cafés', 'Bookshops'] },
    { transport: 'Driving', budget: 30 }, { transport: 'Public transport', budget: 30 },
    { preferences: ['Museums', 'Art galleries'], duration: 8 }, { time: '23:30' },
    { area: 'Surry Hills', time: '09:00', duration: 3 },
  ]) {
    const prefs = { ...base, ...overrides };
    const seed = 37;
    const c = shared.selectVenues(shared.venues, prefs, seed);
    const oldCandidates = legacy.selectVenues(shared.venues, prefs, seed);
    assert.deepEqual(c, oldCandidates);
    const m = shared.demoMatrix(c, prefs.transport);
    assert.deepEqual(m, legacy.demoMatrix(oldCandidates, prefs.transport));
    const p = shared.optimise(c, prefs, m);
    assert.deepEqual(p, legacy.optimise(oldCandidates, prefs, m));
    if (p) {
      assert.deepEqual(shared.replaceStop(p, 1, c, prefs, m), legacy.replaceStop(p, 1, c, prefs, m));
      const excludeSignature = p.stops.map(s => s.id).sort().join('|');
      assert.deepEqual(shared.optimise(c, prefs, m, { excludeSignature }), legacy.optimise(c, prefs, m, { excludeSignature }));
      assert.equal(shared.directions(p.stops, prefs.transport), legacy.directions(p.stops, prefs.transport));
    }
  }
});
test('demo generation requires no provider and injects identity without browser globals', async () => {
  const stages = [];
  const result = await shared.generateItinerary(base, { createId: () => 'test-id', now: () => new Date('2026-10-10T00:00:00Z'), onStage: s => stages.push(s) });
  assert.ok(result.plan);
  assert.equal(result.plan.id, 'test-id');
  assert.equal(result.plan.createdAt, '2026-10-10T00:00:00.000Z');
  assert.equal(result.plan.source, 'estimate');
  assert.ok(result.plan.stops.every(s => s.source === 'demo'));
  assert.equal(stages.length, 3);
  assert.ok(result.plan.cost <= base.budget);
});
test('discovery failure or insufficient live results preserves the demo fallback', async () => {
  for (const venues of [async () => { throw new Error('offline'); }, async () => []]) {
    const result = await shared.generateItinerary(base, { createId: () => 'test', provider: { venues, matrix: async () => { assert.fail('must not route demo venues'); } } });
    assert.ok(result.plan);
    assert.ok(result.plan.stops.every(s => s.source === 'demo'));
    assert.match(result.notice, /Demo venues/);
  }
});
test('live routing failure keeps live venues and labels estimated travel', async () => {
  const result = await shared.generateItinerary(base, { createId: () => 'test', provider: {
    venues: async () => shared.venues.map(v => ({ ...v, source: 'google' })),
    matrix: async () => { throw new Error('quota exhausted'); },
  } });
  assert.ok(result.plan);
  assert.ok(result.plan.stops.every(s => s.source === 'google'));
  assert.equal(result.plan.source, 'estimate');
  assert.match(result.notice, /Routing unavailable/);
});
test('unavailable live edges do not become geographic fallback routes', async () => {
  const result = await shared.generateItinerary(base, { createId: () => 'test', provider: {
    venues: async () => shared.venues.map(v => ({ ...v, source: 'google' })),
    matrix: async venues => venues.map((a) => venues.map(b => ({ minutes: a.id === b.id ? 0 : Infinity, distance: 0, source: 'google' }))),
  } });
  assert.equal(result.plan, null);
});
test('mobile boundary validates calendar dates, times, budgets and area names', () => {
  const today = '2026-10-10';
  assert.equal(shared.validatePreferences(base, today), null);
  for (const override of [{ date: '2026-02-30' }, { date: '2026-10-09' }, { time: '24:00' }, { budget: NaN }, { budget: -1 }, { duration: 0 }, { area: 'constructor' }]) {
    assert.ok(shared.validatePreferences({ ...base, ...override }, today));
  }
  assert.equal(shared.validatePreferences({ ...base, budget: 0 }, today), null);
});
