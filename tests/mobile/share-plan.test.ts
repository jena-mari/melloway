import test from 'node:test';
import assert from 'node:assert/strict';
import { formatItineraryText, type ItineraryTextInput } from '../../apps/mobile/src/services/itineraryText.ts';
import { sharePlanText } from '../../apps/mobile/src/services/sharePlan.ts';

// Fictional fixture only; injected sharers never open a sheet or send anything.
const fixture = {
  prefs: { date: '2026-10-12', transport: 'Walking' as const }, cost: 37.5, source: 'estimate' as const,
  stops: [
    { name: 'Fixture café', arrival: 660, lat: -33.86, lng: 151.21, source: 'demo' as const },
    { name: 'Fixture gallery', arrival: 765, lat: -33.87, lng: 151.22, source: 'google' as const },
  ],
};

test('formatter includes ordered venues, arrivals, outing date, transport, spending and venue-only maps', () => {
  assert.equal(formatItineraryText(fixture), [
    'Melloway plan', 'Outing date: 2026-10-12', 'Transport: Walking',
    'Estimated spending per person: ~$37.50 AUD', '',
    '1. Fixture café — 11:00 am', 'Map: https://www.google.com/maps/search/?api=1&query=-33.86,151.21',
    '2. Fixture gallery — 12:45 pm', 'Map: https://www.google.com/maps/search/?api=1&query=-33.87,151.22', '',
    'Demo venues: sample hours/prices and approximate map pins.',
    'Travel is a rough geographic estimate, not a calculated road or transit route.',
    'Spending and arrival times are planning estimates; confirm venue hours and availability.',
  ].join('\n'));
});

test('share text excludes profile details, private notes, personal origin and free-form notices without mutating plans', () => {
  const plan = { ...fixture, id: 'PRIVATE_PLAN_ID', notice: 'PRIVATE_NOTICE', notes: 'PRIVATE_PLAN_NOTES',
    startingAddress: 'PRIVATE_START_ADDRESS',
    prefs: { ...fixture.prefs, name: 'PRIVATE_NAME', age: 9876, gender: 'PRIVATE_GENDER',
      partner: 'PRIVATE_PARTNER', companion: 'PRIVATE_COMPANION', preferences: ['PRIVATE_INTEREST'],
      notes: 'PRIVATE_PREFERENCE_NOTES', startingAddress: 'PRIVATE_START_ADDRESS' },
    stops: fixture.stops.map(stop => ({ ...stop, note: 'PRIVATE_STOP_NOTE', image: 'PRIVATE_IMAGE',
      mapsUri: 'https://www.google.com/maps/dir/?api=1&origin=PRIVATE_START_ADDRESS' })),
  };
  const snapshot = structuredClone(plan);
  const text = formatItineraryText(plan);
  assert.doesNotMatch(text, /PRIVATE_|9876/);
  assert.deepEqual(plan, snapshot);
  assert.match(text, /Fixture café/);
});

test('missing optional data stays explicit and does not become fabricated cost, time or map links', () => {
  const text = formatItineraryText({ stops: [{}] });
  assert.match(text, /Outing date: Date unavailable/);
  assert.match(text, /Transport: Transport unavailable/);
  assert.match(text, /Estimated spending per person: Unavailable/);
  assert.match(text, /1\. Venue name unavailable — Arrival time unavailable/);
  assert.doesNotMatch(text, /Map:|Demo venues|rough geographic/);
  assert.match(formatItineraryText({}), /No stops available/);
  assert.match(formatItineraryText({ cost: 0 }), /~\$0\.00 AUD/);
  for (const cost of [-1, NaN, Infinity]) assert.match(formatItineraryText({ cost }), /per person: Unavailable/);
});

test('maps use valid venue coordinates or a supplied HTTP(S) venue link, excluding invalid and origin-based routes', () => {
  const valid = formatItineraryText({ stops: [{ name: 'Fixture venue', mapsUri: 'https://maps.google.com/?cid=123' }] });
  assert.match(valid, /Map: https:\/\/maps\.google\.com\/\?cid=123/);
  assert.match(formatItineraryText({ stops: [{ lat: 0, lng: 0 }] }), /query=0,0/);
  for (const mapsUri of ['javascript:alert(1)', 'ftp://maps.example', 'https:///maps.example',
    'https://user:password@maps.example', 'https://maps.example/some path',
    'https://www.google.com/maps/dir/PRIVATE_START_ADDRESS/venue',
    'https://www.google.com/maps/?origin=PRIVATE_START_ADDRESS',
    'https://www.google.com/maps/?saddr=PRIVATE_START_ADDRESS',
    'https://www.google.com/maps/?waypoints=PRIVATE_START_ADDRESS']) {
    const text = formatItineraryText({ stops: [{ lat: 91, lng: NaN, mapsUri }] });
    assert.doesNotMatch(text, /Map:|PRIVATE_START_ADDRESS/);
  }
});

test('arrival formatting handles midnight, after-midnight stops and invalid times', () => {
  const plan = { stops: [{ arrival: 0 }, { arrival: 1445 }, { arrival: NaN }, { arrival: -1 }] };
  const text = formatItineraryText(plan);
  assert.match(text, /1\. Venue name unavailable — 12:00 am/);
  assert.match(text, /2\. Venue name unavailable — 12:05 am \(\+1 day\)/);
  assert.equal(text.match(/Arrival time unavailable/g)?.length, 2);
});

test('disclaimers distinguish demo stops and estimated travel from live venue data', () => {
  const live: ItineraryTextInput = { ...fixture, source: 'google', stops: [{ ...fixture.stops[0], source: 'google' }] };
  assert.doesNotMatch(formatItineraryText(live), /Demo venues|rough geographic/);
  assert.match(formatItineraryText(live), /planning estimates/);
  assert.match(formatItineraryText({ ...live, stops: [{ source: 'google', travelFromPrevious: { source: 'estimate' } }] }), /rough geographic/);
});

test('mock successful sharing receives only a message, invokes once and leaves the plan unchanged', async () => {
  const snapshot = structuredClone(fixture);
  const calls: unknown[] = [];
  assert.equal(await sharePlanText(fixture, async content => {
    calls.push(content); return { action: 'sharedAction' };
  }), 'completed');
  assert.deepEqual(calls, [{ message: formatItineraryText(fixture) }]);
  assert.deepEqual(fixture, snapshot);
  assert.equal(await sharePlanText(fixture, async () => undefined), 'completed'); // Web Share resolves void.
});

test('mock cancellation is normal for both resolved iOS dismissal and rejected Web Share AbortError', async () => {
  assert.equal(await sharePlanText(fixture, async () => ({ action: 'dismissedAction' })), 'cancelled');
  assert.equal(await sharePlanText(fixture, async () => { throw Object.assign(new Error('Mock dismissed'), { name: 'AbortError' }); }), 'cancelled');
});

test('mock sharing failures are caught, including synchronous and non-Error failures', async () => {
  assert.equal(await sharePlanText(fixture, async () => { throw new Error('Mock unsupported'); }), 'failed');
  assert.equal(await sharePlanText(fixture, () => { throw new Error('Mock synchronous failure'); }), 'failed');
  assert.equal(await sharePlanText(fixture, async () => { throw null; }), 'failed');
});
