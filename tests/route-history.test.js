import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft } from '../src/data/preferences.js';
import { demoMatrix, editRoute } from '../src/utils/planner.js';
import { archiveRoute, cleanReview, readJourney, finishJourney, recreateRoute,
  communityRouteSnapshot, HISTORY_KEY, CURRENT_KEY } from '../src/utils/routeHistory.js';

function fixture() {
  const prefs = { ...defaultDraft(), date: '2026-10-11', notes: 'private dietary note', name: 'Jena' };
  const candidates = ['a', 'b', 'c'].map((id, i) => ({ id, name: `Venue ${id}`, category: 'Café',
    tags: ['Coffee shops'], lat: -33.88 + i * .001, lng: 151.2, cost: 10, mins: 30,
    address: 'Sydney', source: 'demo', hours: { open: 0, close: 1440 } }));
  const matrix = demoMatrix(candidates, prefs.transport);
  return { candidates, matrix, plan: { ...editRoute(candidates, prefs, candidates, matrix),
    prefs, id: 'original', status: 'in-progress', startedAt: '2026-10-11T00:00:00.000Z' } };
}
function memory(values = {}) {
  return { values, read: (key, fallback) => values[key] ?? fallback,
    write: (key, value) => { values[key] = JSON.parse(JSON.stringify(value)); } };
}
test('explicit completion snapshots history before clearing current, and never duplicates it', () => {
  const route = fixture(), db = memory({ [CURRENT_KEY]: route });
  const result = finishJourney(route, [], db.write, '2026-10-11T04:00:00Z');
  assert.equal(result.entry.plan.status, 'completed');
  assert.equal(route.plan.status, 'in-progress');
  assert.equal(db.values[CURRENT_KEY], null);
  assert.deepEqual(readJourney(db.read, db.write).history, result.history);
  assert.equal(finishJourney(route, result.history, db.write).history.length, 1);
  route.plan.stops[0].name = 'edited later';
  assert.equal(result.entry.plan.stops[0].name, 'Venue a');
});
test('history write failure keeps the original route intact', () => {
  const route = fixture(), db = memory({ [CURRENT_KEY]: route });
  assert.throws(() => finishJourney(route, [], (key, value) => {
    if (key === HISTORY_KEY) throw new Error('Quota exceeded');
    db.write(key, value);
  }));
  assert.equal(db.values[CURRENT_KEY], route);
  assert.equal(db.values[HISTORY_KEY], undefined);
});
test('an archived route never resurfaces after current-key failure or stale saved restore', () => {
  const route = fixture(), db = memory({ [CURRENT_KEY]: route });
  finishJourney(route, [], (key, value) => {
    if (key === CURRENT_KEY) throw new Error('Quota exceeded');
    db.write(key, value);
  });
  const restored = readJourney(db.read, db.write);
  assert.equal(restored.current, null);
  assert.equal(restored.history.length, 1);
});
test('scheduled end times never complete routes; legacy plans become upcoming', () => {
  const route = fixture(), db = memory({ [CURRENT_KEY]: route });
  route.plan.prefs.date = '2020-01-01';
  assert.equal(readJourney(db.read, db.write).current.plan.status, 'in-progress');
  delete route.plan.status;
  assert.equal(readJourney(db.read, db.write).current.plan.status, 'upcoming');
  assert.equal(readJourney(db.read, db.write).history.length, 0);
});
test('completed legacy current routes migrate to history; corrupt records are excluded', () => {
  const route = fixture();
  route.plan.status = 'completed';
  const db = memory({ [CURRENT_KEY]: route, [HISTORY_KEY]: [null, {}, { id: 'bad', plan: {} }] });
  const restored = readJourney(db.read, db.write);
  assert.equal(restored.current, null);
  assert.equal(restored.history.length, 1);
  assert.equal(db.values[HISTORY_KEY].length, 1);
});
test('a failed legacy migration retains the original completed snapshot on disk', () => {
  const route = fixture();
  route.plan.status = 'completed';
  const db = memory({ [CURRENT_KEY]: route });
  const restored = readJourney(db.read, () => { throw new Error('Quota exceeded'); });
  assert.equal(restored.current, null);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.unpersisted, true);
  assert.equal(db.values[CURRENT_KEY], route);
});
test('private review validates stars, bounds text and ignores unrelated locations', () => {
  const plan = fixture().plan;
  assert.deepEqual(cleanReview({ rating: 6, text: '  lovely  ', stopRatings: { a: 5, b: 0, c: 2.5, foreign: 4 } }, plan),
    { rating: null, text: 'lovely', stopRatings: { a: 5 } });
  assert.equal(cleanReview({ rating: 4, text: 'a'.repeat(500) }, plan).text.length, 300);
  assert.equal(cleanReview(null, plan).rating, null);
});
test('redo reschedules exact stops with a new identity and preserves the original private record', () => {
  const route = fixture(), entry = archiveRoute(route);
  entry.review = { rating: 5, text: 'our memory', stopRatings: { a: 4 } };
  const before = JSON.stringify(entry);
  const prefs = { ...entry.plan.prefs, date: '2026-10-12', time: '12:00' };
  const next = recreateRoute(entry, prefs, route, 'new-copy');
  assert.equal(next.plan.id, 'new-copy');
  assert.equal(next.plan.recreatedFrom, entry.id);
  assert.equal(next.plan.status, 'upcoming');
  assert.equal(next.plan.startedAt, undefined);
  assert.equal(next.plan.completedAt, undefined);
  assert.equal(next.plan.review, undefined);
  assert.equal(next.plan.stops[0].arrival, 720);
  assert.equal(next.plan.prefs.date, '2026-10-12');
  assert.deepEqual(next.plan.stops.map(s => s.id), entry.plan.stops.map(s => s.id));
  next.plan.stops[0].name = 'copy changed';
  assert.equal(JSON.stringify(entry), before);
});
test('redo rejects a new time that cannot fit instead of silently changing the original', () => {
  const route = fixture(), entry = archiveRoute(route);
  entry.plan.stops.forEach(s => { s.hours = { open: 540, close: 1020 }; });
  const original = JSON.stringify(entry);
  const prefs = { ...entry.plan.prefs, time: '23:50', timeExplicit: true };
  assert.equal(recreateRoute(entry, prefs, route, 'new-copy'), null);
  assert.equal(JSON.stringify(entry), original);
});
test('community attachments exclude reviews and private onboarding answers', () => {
  const entry = archiveRoute(fixture());
  entry.plan.review = { text: 'private' };
  const shared = communityRouteSnapshot(entry.plan);
  assert.equal(shared.review, undefined);
  assert.equal(shared.prefs.notes, undefined);
  assert.equal(shared.prefs.name, undefined);
  assert.equal(shared.completedAt, undefined);
  assert.equal(shared.status, undefined);
  assert.equal(shared.stops.length, 3);
  assert.equal(entry.plan.prefs.notes, 'private dietary note');
});
