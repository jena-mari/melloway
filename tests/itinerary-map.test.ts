import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createItineraryMapHandler, itineraryMapPoints } from '../server/itineraryMap.ts';

const stops = [
  { name: 'Mock first stop', lat: -33.873, lng: 151.208 },
  { name: 'Mock second stop', lat: -33.874, lng: 151.207 },
  { name: 'Mock third stop', lat: -33.875, lng: 151.206 },
];
const path = (value: unknown) => `/api/itinerary-map?${new URLSearchParams({ stops: JSON.stringify(value) })}`;
async function request(url: string, key = 'mock-public-demo-key') {
  let status = 0;
  let headers: Record<string, string> = {};
  let body = '';
  const response = {
    writeHead(code: number, values: Record<string, string>) { status = code; headers = values; },
    end(value: string) { body = value; },
  } as unknown as ServerResponse;
  await createItineraryMapHandler({ demoKey: () => key })({ url } as IncomingMessage, response);
  return { status, headers, body };
}

test('the map preserves chosen stop order and exact coordinates, including shared locations', () => {
  const points = itineraryMapPoints([stops[2], stops[0], stops[0]]);
  assert.deepEqual(points.map(p => [p.label, p.name, p.latitude, p.longitude]), [
    ['1', stops[2].name, stops[2].lat, stops[2].lng],
    ['2', stops[0].name, stops[0].lat, stops[0].lng],
    ['3', stops[0].name, stops[0].lat, stops[0].lng],
  ]);
});

test('rejects invalid stop counts, missing fields and out-of-Sydney coordinates', () => {
  for (const value of [null, {}, [], Array(15).fill(stops[0]),
    [{ ...stops[0], name: '' }, ...stops.slice(1)],
    [{ ...stops[0], lat: '-33.873' }, ...stops.slice(1)],
    [{ ...stops[0], lat: NaN }, ...stops.slice(1)],
    [{ ...stops[0], lng: 181 }, ...stops.slice(1)],
    [{ ...stops[0], lat: 0 }, ...stops.slice(1)]]) {
    assert.throws(() => itineraryMapPoints(value), /Invalid itinerary/);
  }
});

test('map endpoint uses only the dedicated public key and makes no provider lookup or route request', async () => {
  const result = await request(path(stops));
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.ok(result.body.includes('key=mock-public-demo-key'));
  assert.ok(result.body.includes('"label":"3"'));
  assert.ok(result.body.includes('melloway-map-route'));
  assert.ok(result.body.includes('top: 76, right: 24'));
  assert.ok(result.body.includes('melloway-map-fit'));
  assert.ok(result.body.includes("event.source !== window.parent || event.origin !== parentOrigin"));
  for (const unexpected of ['places.googleapis.com', 'routes.googleapis.com', 'DirectionsService', 'X-Goog-Api-Key']) {
    assert.ok(!result.body.includes(unexpected));
  }
});

test('unconfigured maps and malformed input produce a safe iframe error while keeping stop cards usable', async () => {
  for (const [url, key, code] of [[path(stops), '', 503], ['/api/itinerary-map', 'mock-key', 400],
    ['/api/itinerary-map?stops=broken', 'mock-key', 400], [path({ secret: 'mock-private-input' }), 'mock-key', 400]] as const) {
    const result = await request(url, key);
    assert.equal(result.status, code);
    assert.ok(result.body.includes('melloway-map-error'));
    assert.ok(!result.body.includes('mock-private-input'));
    assert.ok(!result.body.includes('maps.googleapis.com'));
  }
});

test('provider names and map keys cannot inject scripts into the map HTML', async () => {
  const result = await request(path([{ ...stops[0], name: '</script><script>alert(1)</script>' }, ...stops.slice(1)]), '"><script>bad</script>');
  assert.equal(result.status, 200);
  assert.ok(!result.body.includes('</script><script>alert'));
  assert.ok(!result.body.includes('<script>bad'));
});


test('edited web plans with one stop or fourteen stops retain every numbered Google pin', async () => {
  for (const count of [1, 2, 6, 14]) {
    const edited = Array.from({ length: count }, (_, i) => ({ ...stops[i % stops.length], name: `Mock edited stop ${i + 1}` }));
    assert.equal(itineraryMapPoints(edited).length, count);
    const result = await request(path(edited));
    assert.equal(result.status, 200);
    assert.ok(result.body.includes(`"label":"${count}"`));
  }
});
