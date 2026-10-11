import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { eventMapPoints, type SydneyEvent, type EventMapPoint } from '@melloway/domain';
import { createEventMapHandler, renderVenueMap } from '../server/eventMap.ts';

const originalTicketmaster = process.env.TICKETMASTER_API_KEY;
const originalMaps = process.env.GOOGLE_MAPS_DEMO_KEY;
beforeEach(() => {
  process.env.TICKETMASTER_API_KEY = 'mock-ticketmaster-secret';
  process.env.GOOGLE_MAPS_DEMO_KEY = 'mock-google-demo-key';
});
afterEach(() => {
  for (const [name, original] of [['TICKETMASTER_API_KEY', originalTicketmaster], ['GOOGLE_MAPS_DEMO_KEY', originalMaps]]) {
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

test('map page includes all pins and only the dedicated Demo Key, without Static API or routes', () => {
  const html = renderVenueMap([point, { ...point, label: 'B', latitude: -33.87 }], 'mock-google-demo-key');
  assert.ok(html.includes('maps.googleapis.com/maps/api/js?key=mock-google-demo-key'));
  assert.ok(html.includes('AdvancedMarkerElement'));
  assert.ok(html.includes('fitBounds'));
  assert.ok(html.includes('"label":"A"'));
  assert.ok(html.includes('"label":"B"'));
  assert.ok(html.includes('"latitude":-33.87'));
  for (const text of ['staticmap', 'DirectionsService', 'mock-ticketmaster-secret']) assert.ok(!html.includes(text));
});

test('missing Demo Key and invalid pins cannot generate a map page', () => {
  assert.throws(() => renderVenueMap([point], ''), /not configured/);
  for (const points of [[], Array(11).fill(point), [{ ...point, label: 'X' }], [{ ...point, latitude: 91 }]]) {
    assert.throws(() => renderVenueMap(points, 'mock-google-demo-key'), /Invalid/);
  }
});

test('provider text and Demo Key cannot inject HTML into the map page', () => {
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
