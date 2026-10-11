import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlanTitle, mergeSavedPlans } from '../src/utils/planTitles.js';

test('date names preserve punctuation and Unicode while removing accidental whitespace', () => {
  assert.equal(cleanPlanTitle('  Café & matcha 💚\n afternoon  '), 'Café & matcha 💚 afternoon');
  assert.equal(cleanPlanTitle(' \n '), '');
  assert.equal(cleanPlanTitle(null), '');
});

test('an older cloud copy cannot undo a locally renamed bookmark', () => {
  const local = [{ id: 'date', title: 'Our afternoon', titleUpdatedAt: '2026-10-12T02:00:00Z', cost: 20 }];
  const cloud = [{ id: 'date', title: 'Old name', titleUpdatedAt: '2026-10-12T01:00:00Z', cost: 30 }, { id: 'other', cost: 0 }];
  assert.deepEqual(mergeSavedPlans(local, cloud), [
    { ...cloud[0], title: local[0].title, titleUpdatedAt: local[0].titleUpdatedAt }, cloud[1],
  ]);
  assert.equal(cloud[0].title, 'Old name');
  assert.equal(local[0].cost, 20);
});

test('a newer cloud name syncs and legacy bookmarks still merge without duplicates', () => {
  const local = [{ id: 'date', title: 'Old local name', titleUpdatedAt: '2026-10-12T01:00:00Z' }, { id: 'legacy', cost: 10 }];
  const remote = [{ id: 'date', title: 'New cloud name', titleUpdatedAt: '2026-10-12T02:00:00Z' }, { id: 'legacy', cost: 20 }];
  assert.deepEqual(mergeSavedPlans(local, remote), remote);
  assert.equal(mergeSavedPlans([{ ...local[0], titleUpdatedAt: '2026-10-12T03:00:00Z' }], [{ id: 'date' }])[0].title, 'Old local name');
});
