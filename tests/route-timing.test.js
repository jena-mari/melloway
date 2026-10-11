import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRouteDate, formatRouteDuration, betweenStopsLabel } from '../src/utils/routeTiming.js';

test('route dates keep the selected Sydney calendar day across summer and winter', () => {
  assert.equal(formatRouteDate('2026-10-12'), 'Mon, 12 Oct 2026');
  assert.equal(formatRouteDate('2026-07-12'), 'Sun, 12 July 2026');
  assert.equal(formatRouteDate('2020-01-01'), 'Wed, 1 Jan 2020');
  assert.equal(formatRouteDate('2026-02-30'), 'Date unavailable');
});

test('elapsed and available durations use hours and minutes without rounding an hour down', () => {
  assert.equal(formatRouteDuration(200), '3h 20m');
  assert.equal(formatRouteDuration(300), '5h');
  assert.equal(formatRouteDuration(59.8), '1h');
  assert.equal(formatRouteDuration(0), '0m');
  assert.equal(formatRouteDuration(undefined), 'time unavailable');
});

test('between-stop labels separate travel from waiting and do not invent missing travel times', () => {
  const previous = { arrival: 840, mins: 30 };
  const stop = { arrival: 900, travelFromPrevious: { minutes: 15, source: 'estimate' } };
  assert.equal(betweenStopsLabel(previous, stop, 'Walking'), '~15m walk · 15m wait');
  assert.equal(betweenStopsLabel(previous, stop, 'Driving'), '~15m drive · 15m wait');
  assert.equal(betweenStopsLabel(previous, stop, 'Public transport'), '~15m on public transport · 15m wait');
  assert.equal(betweenStopsLabel(previous, stop, 'Not selected'), '~15m travel buffer · 15m wait');
  assert.equal(betweenStopsLabel(previous, { ...stop, arrival: 885 }, 'Walking'), '~15m walk');
  assert.equal(betweenStopsLabel(previous, { arrival: 900 }, 'Walking'), '30m between stops · travel estimate unavailable');
  assert.equal(betweenStopsLabel(previous, { arrival: 900, travelFromPrevious: { minutes: NaN } }, 'Walking'), '30m between stops · travel estimate unavailable');
});
