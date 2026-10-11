import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft, type EventSearchResponse, type MatchingSydneyEvent } from '@melloway/domain';
import { eventPreferenceQuery, fetchPreferenceEvents } from '../../apps/mobile/src/services/events.ts';

const preferences = { ...defaultDraft(), date: '2026-10-12', time: '11:00', duration: 3, budget: 30, area: 'Newtown' };
const known: MatchingSydneyEvent = { id: 'mock-known', name: 'Mock event', startDate: '2026-10-12', startTime: '12:00:00',
  startDateTime: '2026-10-12T01:00:00Z', endDateTime: null, timezone: 'Australia/Sydney',
  venue: { name: 'Mock venue', address: null, latitude: -33.8965, longitude: 151.1794 }, category: null,
  url: 'https://www.ticketmaster.com.au/event/mock-known', priceRanges: [{ min: 25, max: 80, currency: 'AUD' }],
  minimumPriceAUD: 25, timeWindowFit: 'start-only' };
const unknown: MatchingSydneyEvent = { ...known, id: 'mock-unknown', priceRanges: null, minimumPriceAUD: null };
const fixture: EventSearchResponse = { events: [known], unknownPriceEvents: [unknown], points: [], missingCoordinates: 0,
  mapAvailable: true, truncated: false, preferences: { date: preferences.date, time: preferences.time,
    duration: preferences.duration, budget: preferences.budget, location: { lat: -33.8965, lng: 151.1794, r: 2 } } };

test('native Ticketmaster request sends the existing date, hours, budget and Sydney area only', async t => {
  const query = eventPreferenceQuery(preferences);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(query)), {
    date: '2026-10-12', time: '11:00', duration: '3', budget: '30', lat: '-33.8965', lng: '151.1794', radius: '2',
  });
  assert.ok(!new URLSearchParams(eventPreferenceQuery({ ...preferences, date: '', time: '' })).has('date'));
  t.mock.method(globalThis, 'fetch', async (input: string, options: RequestInit) => {
    assert.equal(input, `http://192.168.0.17:3003/api/events?${query}`);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(fixture);
  });
  const data = await fetchPreferenceEvents(query, 'http://192.168.0.17:3003');
  assert.equal(data.events[0].minimumPriceAUD, 25);
  assert.equal(data.unknownPriceEvents[0].minimumPriceAUD, null);
  assert.equal(data.unknownPriceEvents[0].priceRanges, null);
  assert.equal(data.events[0].endDateTime, null);
  assert.equal(data.events[0].timeWindowFit, 'start-only');
  assert.equal(data.events[0].url, known.url);
  assert.equal(data.events[0].venue?.latitude, -33.8965);
});

test('native filtered events allow bounded pagination results and handle empty and unavailable searches', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...fixture,
    events: Array.from({ length: 11 }, (_, i) => ({ ...known, id: `mock-${i}` })) }));
  assert.equal((await fetchPreferenceEvents('', 'https://example.com')).events.length, 11);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...fixture, events: [], unknownPriceEvents: [] }));
  assert.deepEqual((await fetchPreferenceEvents('', 'https://example.com')).events, []);
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  await assert.rejects(fetchPreferenceEvents('', 'https://example.com'), /not configured/);
  for (const data of [{ ...fixture, unknownPriceEvents: [{ ...unknown, minimumPriceAUD: 0 }] },
    { ...fixture, events: [{ ...known, timeWindowFit: 'fits-entirely-with-guessed-end' }] },
    { ...fixture, events: Array.from({ length: 151 }, () => known) },
    { ...fixture, points: [{ label: 'A', latitude: 91, longitude: 151, eventIds: [] }] }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(data));
    await assert.rejects(fetchPreferenceEvents('', 'https://example.com'), /Invalid filtered event response/);
  }
});
