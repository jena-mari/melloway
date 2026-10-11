import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type SydneyEvent } from '@melloway/domain';
import { createEventsHandler, selectGoogleMapsBrowserKey } from '../server/events.ts';

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
  return { id, name: `Mock event ${id}`, dates: { start: { localDate: '2026-10-12' } },
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
  assert.equal(data.events[0].priceRanges, null);
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
