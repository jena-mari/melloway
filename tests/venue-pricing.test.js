import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFreeAdmission, venuePriceLabel, venueBudgetNote } from '../packages/domain/src/venuePricing.ts';
import { allocateActivityBudgets, replacementBudget } from '../src/utils/activityBudget.js';
import { freeAdmissionEvidence } from '../server/freeAdmission.js';

test('free, unknown and priced allowances have distinct labels, including older saved Google stops', () => {
  assert.equal(venuePriceLabel({ cost: 35, estimatedCost: 0, priceLevel: 'PRICE_LEVEL_FREE' }), 'free entry · $0');
  assert.equal(venueBudgetNote({ cost: 35, estimatedCost: 0, priceStatus: 'free' }), '$35 reserved budget · entry is free');
  for (const priceLevel of [null, 'PRICE_LEVEL_UNSPECIFIED']) {
    assert.equal(venuePriceLabel({ cost: 35, source: 'google', priceStatus: 'estimate', priceLevel }), 'price unconfirmed · $35 planning allowance');
  }
  assert.equal(venuePriceLabel({ cost: 0, priceStatus: 'unknown' }), 'price unconfirmed');
  assert.equal(hasFreeAdmission({ cost: 0, priceStatus: 'unknown' }), false);
  assert.equal(venuePriceLabel({ cost: 45, source: 'google', priceStatus: 'estimate', priceLevel: 'PRICE_LEVEL_MODERATE' }), '~$45 planning allowance');
  assert.equal(venuePriceLabel({ cost: 15, source: 'curated' }), '~$15 each');
  assert.equal(venueBudgetNote({ cost: 35, estimatedCost: 20, priceStatus: 'unknown' }), '$35 budget · entry price unconfirmed');
});

test('reviewed free evidence requires the exact facility and address, never just a skatepark category', () => {
  const reviewed = [{ names: ['fixture skate park'], address: /\bfixtureville\b/, street: /\bfixture road\b/,
    url: 'https://example.com/fixture-council', checkedAt: '2026-10-12' }];
  const place = { displayName: { text: 'Fixture Skate Park' }, formattedAddress: 'Fixture Road, Fixtureville NSW 2000' };
  assert.equal(freeAdmissionEvidence(place, reviewed).url, reviewed[0].url);
  for (const p of [
    { ...place, displayName: { text: 'Fixture Skate Park Lessons' } },
    { ...place, displayName: { text: 'Fixture Indoor Skate Park' } },
    { ...place, displayName: { text: 'Fixture Skate Park Cafe' } },
    { ...place, formattedAddress: 'Other Street, Fixtureville NSW 2000' },
    { ...place, formattedAddress: 'Fixture Road, Elsewhere NSW 2000' },
    { ...place, formattedAddress: 'Fixture Road, Fixtureville VIC 3000' },
  ]) assert.equal(freeAdmissionEvidence(p, reviewed), null);
});

test('free activity stops keep zero entry cost through custom budgets, repeated edits and replacement', () => {
  const free = { id: 'fixture-public', cost: 0, priceStatus: 'free', roles: ['activity'] };
  const paid = { id: 'fixture-private', cost: 20, priceStatus: 'unknown', roles: ['activity'] };
  const prefs = { budget: 100, activityBudgets: { activities: 50 } };
  const first = allocateActivityBudgets([free, paid], prefs);
  assert.deepEqual(first.stops.map(s => s.cost), [0, 50]);
  assert.deepEqual(first.stops.map(s => s.estimatedCost), [0, 20]);
  assert.equal(first.cost, 50);
  assert.deepEqual(allocateActivityBudgets(first.stops, prefs).stops.map(s => s.cost), [0, 50]);
  const onlyFree = allocateActivityBudgets([free], prefs);
  assert.equal(onlyFree.cost, 0);
  assert.equal(onlyFree.budgetAllocated, 50);
  assert.equal(onlyFree.budgetUnassigned, 50);
  assert.equal(onlyFree.budgetBreakdown.activities.minimum, 0);
  assert.equal(replacementBudget(first.stops[1], free).cost, 0);
  // Repair a saved free stop which previously received a spending allocation.
  assert.equal(allocateActivityBudgets([{ ...free, cost: 35, estimatedCost: 20 }], prefs).cost, 0);
  // Missing admission evidence still cannot make a zero-budget paid visit fit.
  assert.equal(allocateActivityBudgets([paid], { budget: 0 }), null);
});
