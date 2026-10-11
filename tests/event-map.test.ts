import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type SydneyEvent, type EventMapPoint } from '@melloway/domain';
import { createEventMapHandler, renderVenueMap, selectGoogleMapsBrowserKey } from '../server/eventMap.ts';

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
const point: EventMapPoint = { ...venue, label: 'A', eventIds: ['1'] };

async function request(handler: ReturnType<typeof createEventMapHandler>, path: string) {
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

test('map page includes all pins and only the configured browser key, without Static API or routes', () => {
  const html = renderVenueMap([point, { ...point, label: 'B', latitude: -33.87 }], 'mock-google-demo-key');
  assert.ok(html.includes('maps.googleapis.com/maps/api/js?key=mock-google-demo-key'));
  assert.ok(html.includes('AdvancedMarkerElement'));
  assert.ok(html.includes('fitBounds'));
  assert.ok(html.includes('"label":"A"'));
  assert.ok(html.includes('"label":"B"'));
  assert.ok(html.includes('"latitude":-33.87'));
  for (const text of ['staticmap', 'DirectionsService', 'mock-ticketmaster-secret', 'mock-places-routes-secret']) assert.ok(!html.includes(text));
});

test('missing browser key and invalid pins cannot generate a map page', () => {
  assert.throws(() => renderVenueMap([point], ''), /not configured/);
  for (const points of [[], Array(11).fill(point), [{ ...point, label: 'X' }], [{ ...point, latitude: 91 }]]) {
    assert.throws(() => renderVenueMap(points, 'mock-google-demo-key'), /Invalid/);
  }
});

test('provider text and browser key cannot inject HTML into the map page', () => {
  const html = renderVenueMap([{ ...point, name: '</script><script>alert(1)</script>' }], '\"><script>bad</script>');
  assert.ok(!html.includes('</script><script>alert'));
  assert.ok(!html.includes('<script>bad'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(html.includes('key=%22%3E%3Cscript%3Ebad%3C%2Fscript%3E'));
});

function providerEvent(id: string, hasCoordinates = true) {
  return { id, name: `Mock event ${id}`, dates: { start: { localDate: '2026-10-12' } },
    _embedded: { venues: [{ name: 'Mock venue', location: hasCoordinates ? { latitude: '-33.86', longitude: '151.21' } : {} }] } };
}

test('event endpoint keeps missing-location events, groups shared pins and exposes no key', async () => {
  const handler = createEventMapHandler({ now: () => now, fetcher: async () => Response.json({
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

test('list and map share one Ticketmaster snapshot; the server makes no Google request', async () => {
  let calls = 0;
  let date = now;
  const handler = createEventMapHandler({ now: () => date, fetcher: async input => {
    assert.equal(new URL(String(input)).hostname, 'app.ticketmaster.com');
    calls++;
    return Response.json({ _embedded: { events: [providerEvent('1')] } });
  } });
  await request(handler, '/api/events');
  const map = await request(handler, '/api/events-map?v=1');
  assert.equal(map.status, 200);
  assert.equal(map.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(map.headers['Cache-Control'], 'no-store');
  assert.ok(String(map.body).includes('mock-google-demo-key'));
  assert.ok(!String(map.body).includes('mock-ticketmaster-secret'));
  assert.equal(calls, 1);
  date = new Date(now.getTime() + 60_001);
  await request(handler, '/api/events');
  assert.equal(calls, 2);
});

test('empty results do not request a Google map or create demo points', async () => {
  let calls = 0;
  const handler = createEventMapHandler({ now: () => now, fetcher: async () => { calls++; return Response.json({ page: { totalElements: 0 } }); } });
  const data = JSON.parse(String((await request(handler, '/api/events')).body));
  assert.deepEqual(data.events, []);
  assert.deepEqual(data.points, []);
  assert.equal((await request(handler, '/api/events-map')).status, 404);
  assert.equal(calls, 1);
});

test('missing Google key still allows Ticketmaster venue inspection but map returns 503', async () => {
  delete process.env.GOOGLE_MAPS_DEMO_KEY;
  const handler = createEventMapHandler({ now: () => now, fetcher: async () =>
    Response.json({ _embedded: { events: [providerEvent('1')] } }) });
  assert.equal(JSON.parse(String((await request(handler, '/api/events')).body)).mapAvailable, false);
  assert.equal((await request(handler, '/api/events-map')).status, 503);
});

test('missing Ticketmaster key returns 503 without a request', async () => {
  delete process.env.TICKETMASTER_API_KEY;
  const handler = createEventMapHandler({ fetcher: async () => { assert.fail('Unexpected API request'); } });
  assert.equal((await request(handler, '/api/events')).status, 503);
});

test('provider failures return a safe error, and a failed fetch can be retried', async () => {
  let calls = 0;
  const handler = createEventMapHandler({ now: () => now, fetcher: async () => {
    if (++calls === 1) throw new Error('mock-ticketmaster-secret');
    return Response.json({ _embedded: { events: [providerEvent('1')] } });
  } });
  const result = await request(handler, '/api/events');
  assert.equal(result.status, 502);
  assert.ok(!String(result.body).includes('secret'));
  assert.equal((await request(handler, '/api/events')).status, 200);
});


// All key values and search/provider data here are explicit test fixtures.
test('browser key selection prefers JavaScript, trims values and supports optional Demo fallback', () => {
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: '  mock-js-key  ', GOOGLE_MAPS_DEMO_KEY: 'mock-demo-key' }), 'mock-js-key');
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: 'mock-js-key' }), 'mock-js-key');
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_DEMO_KEY: '  mock-demo-key  ' }), 'mock-demo-key');
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: '  ', GOOGLE_MAPS_DEMO_KEY: 'mock-demo-key' }), 'mock-demo-key');
  assert.equal(selectGoogleMapsBrowserKey({}), null);
  assert.equal(selectGoogleMapsBrowserKey({ GOOGLE_MAPS_JS_KEY: ' ', GOOGLE_MAPS_DEMO_KEY: '\t' }), null);
});

test('standard key alone enables the map and both keys select only JavaScript without exposing private keys', async () => {
  process.env.GOOGLE_MAPS_JS_KEY = 'mock-js-key';
  delete process.env.GOOGLE_MAPS_DEMO_KEY;
  const handler = createEventMapHandler({ now: () => now, fetcher: async () =>
    Response.json({ _embedded: { events: [providerEvent('1')] } }) });
  const result = await request(handler, '/api/events');
  assert.equal(JSON.parse(String(result.body)).mapAvailable, true);
  for (const text of ['mock-js-key', 'mock-ticketmaster-secret', 'mock-places-routes-secret']) assert.ok(!String(result.body).includes(text));
  process.env.GOOGLE_MAPS_DEMO_KEY = 'mock-google-demo-key';
  const map = await request(handler, '/api/events-map');
  assert.equal(map.status, 200);
  assert.ok(String(map.body).includes('key=mock-js-key'));
  for (const text of ['mock-google-demo-key', 'mock-ticketmaster-secret', 'mock-places-routes-secret', 'Demo Key']) assert.ok(!String(map.body).includes(text));
});

test('missing browser configuration never substitutes the private Places/Routes key, even with a cached event list', async () => {
  const handler = createEventMapHandler({ now: () => now, fetcher: async () =>
    Response.json({ _embedded: { events: [providerEvent('1')] } }) });
  await request(handler, '/api/events');
  process.env.GOOGLE_MAPS_JS_KEY = ' ';
  process.env.GOOGLE_MAPS_DEMO_KEY = ' ';
  const list = await request(handler, '/api/events');
  assert.equal(JSON.parse(String(list.body)).mapAvailable, false);
  assert.equal(JSON.parse(String(list.body)).points.length, 1);
  const map = await request(handler, '/api/events-map');
  assert.equal(map.status, 503);
  assert.match(String(map.body), /GOOGLE_MAPS_JS_KEY or GOOGLE_MAPS_DEMO_KEY/);
  assert.ok(!String(map.body).includes('mock-places-routes-secret'));
});

function mapRuntime() {
  const elements = { map: { hidden: false }, error: { hidden: true, textContent: '' } };
  const messages: unknown[] = [];
  const timers: { callback: () => void; delay: number }[] = [];
  const cleared: number[] = [];
  const window = { parent: { postMessage: (message: unknown) => messages.push(message) },
    gm_authFailure: () => {}, initVenueMap: async () => {} };
  const html = renderVenueMap([point], 'mock-js-key');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  const google = { maps: { importLibrary: async () => { throw new Error('Mock library failure'); } } };
  runInNewContext(script, { window, google,
    document: { getElementById: (id: keyof typeof elements) => elements[id] },
    setTimeout: (callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: (id: number) => cleared.push(id) });
  return { window, elements, messages, timers, cleared };
}

test('Google authentication failure hides the map, identifies API/referrer checks and notifies the venue list', () => {
  const runtime = mapRuntime();
  runtime.window.gm_authFailure();
  assert.equal(runtime.elements.map.hidden, true);
  assert.equal(runtime.elements.error.hidden, false);
  assert.match(runtime.elements.error.textContent, /authentication failed/);
  assert.match(runtime.elements.error.textContent, /Maps JavaScript API access and allowed website referrers/);
  assert.ok(!runtime.elements.error.textContent.includes('mock-js-key'));
  assert.ok(!runtime.elements.error.textContent.includes('Demo Key'));
  assert.equal(JSON.stringify(runtime.messages), '[{"type":"melloway-map-error"}]');
  assert.deepEqual(runtime.cleared, [1]);
});

test('a failed Maps library or loading timeout notifies the list without a real Google request', async () => {
  const failed = mapRuntime();
  await failed.window.initVenueMap();
  assert.match(failed.elements.error.textContent, /Google map could not load/);
  assert.equal(failed.elements.map.hidden, true);
  assert.equal(failed.messages.length, 1);
  const timedOut = mapRuntime();
  assert.equal(timedOut.timers[0]!.delay, 20000);
  timedOut.timers[0]!.callback();
  assert.equal(timedOut.elements.map.hidden, true);
  assert.equal(timedOut.messages.length, 1);
});
