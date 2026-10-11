import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft } from '../src/data/preferences.js';
import { demoMatrix, editRoute, directions, addStop } from '../src/utils/planner.js';
import { reorderRoute } from '../src/engine/routeEditing.js';
import { replacementBudget } from '../src/utils/activityBudget.js';
import { editRoute as mobileEdit, defaultDraft as mobileDraft, directions as mobileDirections, reorderSelected, formatTime as mobileTime } from '@melloway/domain';

const prefs = { ...defaultDraft(), date: '2026-10-12', transport: 'Walking', time: '11:00', duration: 8, budget: 100 };
const stops = ['a', 'b', 'c'].map((id, i) => ({ id, name: `Test ${id}`, address: `Test address ${i}`, area: 'Sydney CBD', lat: -33.87, lng: 151.2 + i * .001, category: 'Bookshops', tags: ['Bookshops'], cost: 10, mins: 30, source: 'demo', hours: { open: 540, close: 1320 } }));
const matrix = [[0, 30, 1], [2, 0, 30], [30, 1, 0]].map(row => row.map(minutes => ({ minutes, distance: .1, source: 'estimate' })));

test('timeframe edits cascade while exact later arrivals, visit lengths and originals stay intact', () => {
  for (const edit of [editRoute, mobileEdit]) {
    const original = edit(stops, prefs, stops, matrix);
    const next = edit([{ ...stops[0], mins: 120, arrivalOverride: 720 }, ...stops.slice(1)], prefs, stops, matrix);
    assert.equal(next.stops[0].arrival, 720);
    assert.equal(next.stops[1].arrival, 870);
    assert.equal(next.stops[2].arrival, 930);
    assert.equal(original.stops[0].arrival, 660);
    assert.equal(stops[0].mins, 30);
    assert.equal(edit([{ ...stops[0], arrivalOverride: 500 }, ...stops.slice(1)], prefs, stops, matrix), null);
    assert.equal(edit([{ ...stops[0], arrivalOverride: 1300 }, ...stops.slice(1)], prefs, stops, matrix), null);
    assert.equal(edit([stops[0], { ...stops[1], arrivalOverride: 680 }, stops[2]], prefs, stops, matrix), null);
  }
});

test('optimise and shuffle keep all selected venues; manual order stays exactly as chosen', () => {
  const plan = { ...editRoute(stops, prefs, stops, matrix), prefs };
  const best = reorderRoute(plan, stops, matrix, 'optimise').plan;
  assert.equal(best.travel, 2);
  assert.deepEqual(best.stops.map(s => s.id), ['a', 'c', 'b']);
  const shuffled = reorderRoute(plan, stops, matrix, 'shuffle').plan;
  assert.deepEqual(shuffled.stops.map(s => s.id).sort(), ['a', 'b', 'c']);
  assert.notDeepEqual(shuffled.stops.map(s => s.id), plan.stops.map(s => s.id));
  const manual = editRoute([stops[2], stops[1], stops[0]], prefs, stops, matrix);
  assert.deepEqual(manual.stops.map(s => s.id), ['c', 'b', 'a']);
  const mobile = reorderSelected(stops, order => mobileEdit(order, prefs, stops, matrix), 'optimise');
  assert.deepEqual(mobile.plan.stops.map(s => s.id), best.stops.map(s => s.id));
});

test('order search respects fixed arrivals, opening windows, budget and logical dinner timing', () => {
  const pinned = stops.map((s, i) => ({ ...s, arrivalOverride: 660 + i * 90 }));
  const plan = { ...editRoute(pinned, prefs, stops, matrix), prefs };
  assert.equal(reorderRoute(plan, stops, matrix, 'shuffle').plan, null);
  assert.equal(reorderRoute({ ...plan, prefs: { ...prefs, budget: 20 } }, stops, matrix, 'optimise').plan, null);
  const dinner = { ...stops[0], category: 'Dinner', tags: ['Dinner'] };
  const dinnerPlan = { ...editRoute([dinner, stops[1]], prefs, [dinner, ...stops.slice(1)], matrix), prefs };
  assert.equal(reorderRoute(dinnerPlan, [dinner, ...stops.slice(1)], matrix, 'shuffle').plan, null);
  const closed = stops.map(s => ({ ...s, hours: { open: 1100, close: 1110 } }));
  assert.equal(reorderRoute({ stops: closed, prefs }, closed, matrix, 'optimise').plan, null);
});

test('additions preserve old relative order and timeframe; replacing a spot keeps edited timeframes', () => {
  const edited = [{ ...stops[0], mins: 60, visitOverride: 60, arrivalOverride: 720 }, stops[1]];
  const plan = { ...editRoute(edited, prefs, stops, matrix), prefs };
  const next = addStop(plan, stops[2], stops, matrix);
  assert.ok(next); assert.deepEqual(next.stops.filter(s => s.id !== 'c').map(s => s.id), ['a', 'b']);
  assert.equal(next.stops.find(s => s.id === 'a').arrival, 720);
  const replaced = replacementBudget(edited[0], stops[2]);
  assert.equal(replaced.arrivalOverride, 720); assert.equal(replaced.mins, 60);
});

test('new drafts leave travel unset and directions do not invent a mode', () => {
  for (const draft of [defaultDraft, mobileDraft]) assert.equal(draft().transport, 'Not selected');
  for (const link of [directions, mobileDirections]) {
    assert.equal(new URL(link(stops, 'Not selected')).searchParams.get('travelmode'), null);
    assert.equal(new URL(link(stops, 'Driving')).searchParams.get('travelmode'), 'driving');
    assert.equal(new URL(link(stops, 'Public transport')).searchParams.get('travelmode'), 'transit');
  }
  const buffer = demoMatrix(stops, 'Not selected');
  assert.ok(buffer.every(row => row.every(edge => edge.source === 'estimate')));
});

test('next-day timeframes respect overnight and next-day opening windows', () => {
  const latePrefs = { ...prefs, time: '23:00', duration: 4 };
  const late = [{ ...stops[0], arrivalOverride: 1500, weeklyHours: { 1: [{open:1320,close:1560}] } },
    { ...stops[1], mins: 15, weeklyHours: { 2: [{open:0,close:120}] } }];
  const shortMatrix = [[0,1],[1,0]].map(row => row.map(minutes => ({minutes,distance:.1,source:'estimate'})));
  for (const edit of [editRoute, mobileEdit]) {
    const next = edit(late, latePrefs, late, shortMatrix);
    assert.deepEqual(next.stops.map(s => s.arrival), [1500,1531]);
    assert.equal(edit([{ ...late[0], arrivalOverride: 1550 }, late[1]], latePrefs, late, shortMatrix), null);
  }
  assert.equal(mobileTime(1500), '1:00 am');
});
