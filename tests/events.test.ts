import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type SydneyEvent } from '@melloway/domain';
import { createEventsHandler, selectGoogleMapsBrowserKey } from '../server/events.ts';
import { sydneyInstant } from '../server/eventPreferences.ts';
import { eventQuery, eventPostFromTicketmaster, loadEvents } from '../src/services/events.ts';

const originalTicketmaster = process.env.TICKETMASTER_API_KEY;
const originalMaps = process.env.GOOGLE_MAPS_DEMO_KEY;
const originalJS = process.env.GOOGLE_MAPS_JS_KEY;
const originalPrivateMaps = process.env.GOOGLE_MAPS_API_KEY;
beforeEach(() => {
  process.env.TICKETMASTER_API_KEY = 'mock-ticketmaster-secret';
  process.env.GOOGLE_MAPS_DEMO_KEY = 'mock-google-demo-key';
  delete process.env.GOOGLE_MAPS_JS_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'mock-places-routes-secret';
});
afterEach(() => {
  for (const [name, original] of [['TICKETMASTER_API_KEY', originalTicketmaster], ['GOOGLE_MAPS_DEMO_KEY', originalMaps], ['GOOGLE_MAPS_JS_KEY', originalJS], ['GOOGLE_MAPS_API_KEY', originalPrivateMaps]]) {
    if (original === undefined) delete process.env[name!]; else process.env[name!] = original;
  }
});
const now = new Date('2026-10-11T00:00:00Z');
const venue = { name: 'Mock venue', address: 'Mock street', latitude: -33.86, longitude: 151.21 };
function event(id: string, location: SydneyEvent['venue'] = venue): SydneyEvent {
  return { id, name: `Mock event ${id}`, startDate: '2026-10-12', startTime: null, startDateTime: null,
    timezone: 'Australia/Sydney', venue: location, category: null, url: null, priceRanges: null };
}

async function request(handler: ReturnType<typeof createEventsHandler>, path: string) {
  let status = 0;
  let headers: Record<string, string> = {};
  let body: string | Buffer = '';
  const res = {
    writeHead(code: number, values: Record<string, string>) { status = code; headers = values; },
    end(value: string | Buffer) { body = value; },
  } as unknown as ServerResponse;
  await handler({ url: path } as IncomingMessage, res);
  return { status, headers, body: body as string | Buffer };
}

function providerEvent(id: string, hasCoordinates = true) {
  return { id, name: `Mock event ${id}`, dates: { start: { localDate: '2026-10-11', localTime: '12:00:00' } },
    priceRanges: [{ min: 25, currency: 'AUD' }],
    _embedded: { venues: [{ name: 'Mock venue', location: hasCoordinates ? { latitude: '-33.86', longitude: '151.21' } : {} }] } };
}


test('groups repeated venue coordinates without losing events or moving pins', () => {
  const points = eventMapPoints([event('1'), event('2'), event('3', { ...venue, longitude: 151.22 })]);
  assert.deepEqual(points, [{ ...venue, label: 'A', eventIds: ['1', '2'] },
    { ...venue, longitude: 151.22, label: 'B', eventIds: ['3'] }]);
});

test('unusable coordinates are not fabricated and real zero coordinates survive', () => {
  const points = eventMapPoints([event('missing', null), event('partial', { ...venue, latitude: null }),
    event('invalid', { ...venue, longitude: 181 }), event('nan', { ...venue, latitude: NaN }),
    event('zero', { ...venue, latitude: 0, longitude: 0 })]);
  assert.deepEqual(points, [{ ...venue, latitude: 0, longitude: 0, label: 'A', eventIds: ['zero'] }]);
});

test('event endpoint keeps missing-location events, groups shared pins and exposes no key', async () => {
  const handler = createEventsHandler({ now: () => now, fetcher: async () => Response.json({
    _embedded: { events: [providerEvent('1'), providerEvent('2'), providerEvent('3', false)] },
  }) });
  const result = await request(handler, '/api/events');
  assert.equal(result.status, 200);
  const data = JSON.parse(String(result.body));
  assert.equal(data.events.length, 3);
  assert.equal(data.points.length, 1);
  assert.deepEqual(data.points[0].eventIds, ['1', '2']);
  assert.equal(data.missingCoordinates, 1);
  assert.equal(data.mapAvailable, true);
  assert.equal(data.events[0].minimumPriceAUD, 25);
  assert.equal(data.events[0].timeWindowFit, 'start-only');
  assert.ok(!String(result.body).includes('secret'));
});

test('missing Ticketmaster key returns 503 without a request', async () => {
  delete process.env.TICKETMASTER_API_KEY;
  const handler = createEventsHandler({ fetcher: async () => { assert.fail('Unexpected API request'); } });
  assert.equal((await request(handler, '/api/events')).status, 503);
});

test('provider failures return a safe error, and a failed fetch can be retried', async () => {
  let calls = 0;
  const handler = createEventsHandler({ now: () => now, fetcher: async () => {
    if (++calls === 1) throw new Error('mock-ticketmaster-secret');
    return Response.json({ _embedded: { events: [providerEvent('1')] } });
  } });
  const result = await request(handler, '/api/events');
  assert.equal(result.status, 502);
  assert.ok(!String(result.body).includes('secret'));
  assert.equal((await request(handler, '/api/events')).status, 200);
});

test('browser key selection prefers JavaScript, trims values and supports optional Demo fallback', () => {
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: '  mock-js-key  ', GOOGLE_MAPS_DEMO_KEY: 'mock-demo-key' }), 'mock-js-key');
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: 'mock-js-key' }), 'mock-js-key');
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_DEMO_KEY: '  mock-demo-key  ' }), 'mock-demo-key');
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: '  ', GOOGLE_MAPS_DEMO_KEY: 'mock-demo-key' }), 'mock-demo-key');
  assert.equal(selectGoogleMapsBrowserKey({}), null);
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: ' ', GOOGLE_MAPS_DEMO_KEY: '\t' }), null);
});

test('repeated JSON requests share a 60-second snapshot and never call Google', async () => {
  let calls = 0;
  let date = now;
  const handler = createEventsHandler({ now: () => date, fetcher: async input => {
    assert.equal(new URL(String(input)).hostname, 'app.ticketmaster.com');
    calls++;
    return Response.json({ _embedded: { events: [providerEvent('1')] } });
  } });
  await Promise.all([request(handler, '/api/events'), request(handler, '/api/events')]);
  assert.equal(calls, 1);
  await request(handler, '/api/events');
  assert.equal(calls, 1);
  date = new Date(now.getTime() + 60_001);
  await request(handler, '/api/events');
  assert.equal(calls, 2);
});

test('empty results stay empty without invented events or points', async () => {
  const handler = createEventsHandler({ now: () => now, fetcher: async () => Response.json({ page: { totalElements: 0 } }) });
  const data = JSON.parse(String((await request(handler, '/api/events')).body));
  assert.deepEqual(data.events, []);
  assert.deepEqual(data.points, []);
  assert.equal(data.missingCoordinates, 0);
});

test('missing browser configuration preserves JSON venue inspection and never substitutes private keys', async () => {
  const handler = createEventsHandler({ now: () => now, fetcher: async () =>
    Response.json({ _embedded: { events: [providerEvent('1')] } }) });
  await request(handler, '/api/events');
  process.env.GOOGLE_MAPS_JS_KEY = ' ';
  process.env.GOOGLE_MAPS_DEMO_KEY = ' ';
  const list = await request(handler, '/api/events');
  assert.equal(list.status, 200);
  assert.equal(JSON.parse(String(list.body)).mapAvailable, false);
  assert.equal(JSON.parse(String(list.body)).points.length, 1);
  assert.ok(!String(list.body).includes('mock-places-routes-secret'));
});

test('standard key configuration is reported without exposing any key in JSON', async () => {
  process.env.GOOGLE_MAPS_JS_KEY = 'mock-js-key';
  const handler = createEventsHandler({ now: () => now, fetcher: async () =>
    Response.json({ _embedded: { events: [providerEvent('1')] } }) });
  const result = await request(handler, '/api/events');
  assert.equal(JSON.parse(String(result.body)).mapAvailable, true);
  for (const text of ['mock-js-key', 'mock-google-demo-key', 'mock-ticketmaster-secret', 'mock-places-routes-secret']) {
    assert.ok(!String(result.body).includes(text));
  }
});

function timedEvent(id: string, date = '2026-10-12', time: string | null = '12:00:00', prices: unknown = [{ min: 25, currency: 'AUD' }], end?: string) {
  return { ...providerEvent(id), url: `https://www.ticketmaster.com.au/event/${id}`,
    dates: { start: { localDate: date, ...(time ? { localTime: time } : {}) }, ...(end ? { end: { dateTime: end } } : {}) },
    priceRanges: prices };
}
const preferences = '/api/events?date=2026-10-12&time=11:00&duration=3&budget=30';
async function dataFor(events: unknown[], path = preferences) {
  const handler = createEventsHandler({ now: () => now, fetcher: async () => Response.json({ _embedded: { events } }) });
  const response = await request(handler, path);
  assert.equal(response.status, 200);
  return JSON.parse(String(response.body));
}

test('different selected dates search different windows, return different matches and have separate caches', async () => {
  const searches: URL[] = [];
  const handler = createEventsHandler({ now: () => now, fetcher: async input => {
    searches.push(new URL(String(input)));
    return Response.json({ _embedded: { events: [timedEvent('day12'), timedEvent('day13', '2026-10-13')] } });
  } });
  const first = JSON.parse(String((await request(handler, preferences)).body));
  const second = JSON.parse(String((await request(handler, preferences.replace('10-12', '10-13'))).body));
  await request(handler, preferences);
  assert.deepEqual(first.events.map((e: SydneyEvent) => e.id), ['day12']);
  assert.deepEqual(second.events.map((e: SydneyEvent) => e.id), ['day13']);
  assert.equal(searches.length, 2);
  assert.equal(searches[0].searchParams.get('startDateTime'), '2026-10-12T00:00:00Z');
  assert.equal(searches[0].searchParams.get('endDateTime'), '2026-10-12T02:59:59Z');
  assert.equal(searches[1].searchParams.get('startDateTime'), '2026-10-13T00:00:00Z');
});

test('$30 uses the minimum advertised AUD price; missing, max-only and foreign prices remain separate', async () => {
  const data = await dataFor([
    timedEvent('cheap', undefined, undefined, [{ min: 25, max: 100, currency: 'AUD' }]),
    timedEvent('boundary', undefined, undefined, [{ min: 30, currency: 'AUD' }]),
    timedEvent('expensive', undefined, undefined, [{ min: 30.01, currency: 'AUD' }]),
    timedEvent('free', undefined, undefined, [{ min: 0, currency: 'AUD' }]),
    timedEvent('multiple', undefined, undefined, [{ min: 60, currency: 'AUD' }, { min: 29, currency: 'AUD' }]),
    timedEvent('unknown', undefined, undefined, []),
    timedEvent('foreign', undefined, undefined, [{ min: 1, currency: 'USD' }]),
    timedEvent('no-currency', undefined, undefined, [{ min: 0 }]),
    timedEvent('max-only', undefined, undefined, [{ max: 10, currency: 'AUD' }]),
  ]);
  assert.deepEqual(data.events.map((e: SydneyEvent) => e.id), ['cheap', 'boundary', 'free', 'multiple']);
  assert.deepEqual(data.unknownPriceEvents.map((e: SydneyEvent) => e.id), ['unknown', 'foreign', 'no-currency', 'max-only']);
  for (const event of data.unknownPriceEvents) assert.equal(event.minimumPriceAUD, null);
  assert.equal(data.unknownPriceEvents[0].priceRanges, null);
  const zero = await dataFor([timedEvent('paid'), timedEvent('free', undefined, undefined, [{ min: 0, currency: 'AUD' }])], preferences.replace('budget=30', 'budget=0'));
  assert.deepEqual(zero.events.map((e: SydneyEvent) => e.id), ['free']);
});

test('start times must be known and inside the window; known finishes must fit, unknown finishes stay start-only', async () => {
  const data = await dataFor([
    timedEvent('before', undefined, '10:59:59'), timedEvent('at-start', undefined, '11:00:00'),
    timedEvent('at-end', undefined, '14:00:00'), timedEvent('after', undefined, '15:00:00'),
    timedEvent('unknown-start', undefined, null),
    timedEvent('too-long', undefined, undefined, undefined, '2026-10-12T04:00:00Z'),
    timedEvent('full-fit', undefined, undefined, undefined, '2026-10-12T03:00:00Z'),
    timedEvent('invalid-end', undefined, undefined, undefined, '2026-10-12T00:00:00Z'),
    { ...timedEvent('tba'), dates: { start: { localDate: '2026-10-12', localTime: '12:00:00', timeTBA: true } } },
    { ...timedEvent('approximate-end'), dates: { ...timedEvent('x').dates, end: { dateTime: '2026-10-12T03:00:00Z', approximate: true } } },
  ]);
  assert.deepEqual(data.events.map((e: SydneyEvent) => e.id), ['at-start', 'full-fit', 'approximate-end']);
  assert.equal(data.events[0].timeWindowFit, 'start-only');
  assert.equal(data.events[0].endDateTime, null);
  assert.equal(data.events[1].timeWindowFit, 'fits');
  assert.equal(data.events[2].timeWindowFit, 'start-only');
  assert.match(eventPostFromTicketmaster(data.events[0]).text, /finish time unknown/);
});

test('Sydney defaults, winter/summer offsets, DST gaps and repeated times use Sydney rules', async () => {
  assert.equal(sydneyInstant('2026-06-12', '11:00').toISOString(), '2026-06-12T01:00:00.000Z');
  assert.equal(sydneyInstant('2026-10-12', '11:00').toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(sydneyInstant('2027-04-04', '02:30').toISOString(), '2027-04-03T15:30:00.000Z');
  assert.throws(() => sydneyInstant('2026-10-04', '02:30'), /does not exist/);
  const handler = createEventsHandler({ now: () => new Date('2026-10-10T14:30:00Z'),
    fetcher: async () => Response.json({ _embedded: { events: [timedEvent('today', '2026-10-11')] } }) });
  const skipped = JSON.parse(String((await request(handler, '/api/events?date=&time=&duration=3&budget=30')).body));
  assert.equal(skipped.preferences.date, '2026-10-11');
  assert.deepEqual(skipped.events.map((e: SydneyEvent) => e.id), ['today']);
  const dst = await dataFor([timedEvent('inside', '2026-10-04', '04:30:00'), timedEvent('end', '2026-10-04', '05:00:00')],
    '/api/events?date=2026-10-04&time=01:00&duration=3&budget=30');
  assert.deepEqual(dst.events.map((e: SydneyEvent) => e.id), ['inside']);
});

test('overnight availability does not include events starting on a different selected date', async () => {
  const data = await dataFor([timedEvent('late', undefined, '23:30:00', undefined, '2026-10-12T14:00:00Z'),
    timedEvent('next-day', '2026-10-13', '00:30:00')], preferences.replace('11:00', '22:00'));
  assert.deepEqual(data.events.map((e: SydneyEvent) => e.id), ['late']);
  assert.equal(data.events[0].timeWindowFit, 'fits');
});

test('invalid dates, hours, budgets and locations fail before any provider request', async () => {
  const handler = createEventsHandler({ fetcher: async () => assert.fail('Unexpected provider call') });
  for (const query of ['date=2026-02-30', 'time=25:00', 'duration=2', 'duration=9', 'budget=-1', 'budget=201',
    'budget=', 'duration=NaN', 'date=2026-10-04&time=02:30', 'lat=-33.86', 'lat=-37&lng=151',
    'lat=-33.86&lng=151.21&radius=100', 'date=2026-10-12&date=2026-10-13']) {
    assert.equal((await request(handler, `/api/events?${query}`)).status, 400, query);
  }
});

test('Sydney location constrains nearby events while preserving coordinates and booking links', async () => {
  const path = `${preferences}&lat=-33.86&lng=151.21&radius=2`;
  const nearby = timedEvent('nearby');
  const distant = { ...timedEvent('distant'), _embedded: { venues: [{ location: { latitude: -34.1, longitude: 151.21 } }] } };
  const missing = { ...timedEvent('missing'), _embedded: { venues: [] } };
  const data = await dataFor([nearby, distant, missing], path);
  assert.deepEqual(data.events.map((e: SydneyEvent) => e.id), ['nearby']);
  assert.equal(data.events[0].url, nearby.url);
  assert.equal(data.events[0].venue.latitude, -33.86);
  assert.equal(data.events[0].venue.longitude, 151.21);
});

test('limited pagination finds later-page matches, deduplicates and shares one request deadline', async () => {
  const urls: URL[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  const handler = createEventsHandler({ now: () => now, fetcher: async (input, options) => {
    const url = new URL(String(input)); urls.push(url); signals.push(options?.signal);
    const page = Number(url.searchParams.get('page'));
    assert.equal(url.searchParams.get('size'), '50');
    return Response.json({ page: { totalPages: 20 }, _embedded: { events: [
      timedEvent('duplicate'), timedEvent(`page${page}`, undefined, undefined, [{ min: page === 2 ? 30 : 60, currency: 'AUD' }]),
    ] } });
  } });
  const data = JSON.parse(String((await request(handler, preferences)).body));
  assert.equal(urls.length, 3);
  assert.deepEqual(urls.map(u => u.searchParams.get('page')), ['0', '1', '2']);
  assert.ok(signals.every(signal => signal === signals[0]));
  assert.deepEqual(data.events.map((e: SydneyEvent) => e.id), ['duplicate', 'page2']);
  assert.equal(data.truncated, true);
});

test('cache varies by hours, budget and location; concurrent unique searches are bounded', async () => {
  let calls = 0;
  const handler = createEventsHandler({ now: () => now, fetcher: async () => {
    calls++; return Response.json({ _embedded: { events: [timedEvent('one')] } });
  } });
  for (const path of [preferences, preferences.replace('budget=30', 'budget=20'), preferences.replace('11:00', '13:00'),
    preferences.replace('duration=3', 'duration=4'), `${preferences}&lat=-33.86&lng=151.21&radius=2`]) await request(handler, path);
  assert.equal(calls, 5);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const bounded = createEventsHandler({ now: () => now, fetcher: async () => { await gate; return Response.json({}); } });
  const active = [1, 2, 3, 4].map(budget => request(bounded, preferences.replace('budget=30', `budget=${budget}`)));
  assert.equal((await request(bounded, preferences)).status, 502);
  release();
  for (const result of await Promise.all(active)) assert.equal(result.status, 200);
});

test('frontend request uses only existing answers, keeps unknown prices unknown and handles unavailable/empty results', async () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(eventQuery({ date: '', time: '', duration: 3, budget: 30,
    location: { lat: -33.86, lng: 151.21, r: 2 } }))), {
    time: '11:00', duration: '3', budget: '30', lat: '-33.86', lng: '151.21', radius: '2',
  });
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      assert.match(String(input), /^\/api\/events\?time=11%3A00&duration=3&budget=30$/);
      return Response.json({ events: [], unknownPriceEvents: [] });
    };
    assert.deepEqual((await loadEvents(eventQuery({ duration: 3, budget: 30 }), new AbortController().signal)).events, []);
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    await assert.rejects(loadEvents('', new AbortController().signal), /Ticketmaster key/);
  } finally { globalThis.fetch = old; }
  const data = await dataFor([timedEvent('unknown', undefined, undefined, [])]);
  const poster = eventPostFromTicketmaster(data.unknownPriceEvents[0]);
  assert.match(poster.entry, /price unknown/);
  assert.ok(!poster.entry.includes('$0'));
  assert.equal(poster.bookingUrl, 'https://www.ticketmaster.com.au/event/unknown');
});
