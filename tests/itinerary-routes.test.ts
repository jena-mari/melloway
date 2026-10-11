import test from 'node:test';
import assert from 'node:assert/strict';
import { createItineraryRoutesProvider, readItineraryRouteRequest } from '../server/itineraryRoutes.ts';

const stops = [0, 1, 2].map(index => ({ name: `Mock stop ${index}`, lat: -33.87 - index * .01, lng: 151.2 + index * .01,
  departureMinutes: 720 + index * 90 }));
const request = (transport = 'Walking') => readItineraryRouteRequest({ stops, transport, date: '2026-10-12', time: '11:00' });
function payload(index: number) {
  return { routes: [{ polyline: { geoJsonLinestring: { type: 'LineString',
    coordinates: [[stops[index].lng, stops[index].lat], [stops[index + 1].lng, stops[index].lat],
      [stops[index + 1].lng, stops[index + 1].lat]] } }, warnings: ['Mock provider walking warning.'] }] };
}

test('walking routes follow provider geometry in original stop order without transit options or exposed keys', async () => {
  let calls = 0;
  const result = await createItineraryRoutesProvider('mock-private-key', async (url, options) => {
    assert.equal(String(url), 'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.equal((options?.headers as Record<string,string>)['X-Goog-Api-Key'], 'mock-private-key');
    assert.equal((options?.headers as Record<string,string>)['X-Goog-FieldMask'], 'routes.polyline.geoJsonLinestring,routes.warnings');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.travelMode, 'WALK');
    assert.equal(body.departureTime, undefined);
    assert.equal(body.polylineEncoding, 'GEO_JSON_LINESTRING');
    assert.equal(body.optimizeWaypointOrder, undefined);
    return Response.json(payload(calls++));
  })(request());
  assert.deepEqual(result.paths.map(leg => [leg.fromIndex, leg.toIndex]), [[0,1],[1,2]]);
  assert.equal(result.paths[0].path.length, 3);
  assert.equal(result.paths[0].path[1].lng, stops[1].lng);
  assert.equal(result.paths[0].path[1].lat, stops[0].lat);
  assert.equal(result.missingLegs, 0);
  assert.deepEqual(result.warnings, ['Mock provider walking warning.']);
  assert.ok(!JSON.stringify(result).includes('mock-private-key'));
});

test('public transport requests each consecutive leg for its Sydney scheduled departure, including overnight stops', async () => {
  let calls = 0;
  const value = request('Public transport');
  value.stops = [{...stops[0],departureMinutes:1430}, {...stops[1],departureMinutes:1490}, stops[2]];
  await createItineraryRoutesProvider('mock-key', async (_, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.travelMode, 'TRANSIT');
    assert.equal(body.intermediates, undefined);
    assert.equal(body.departureTime, ['2026-10-12T12:50:00.000Z','2026-10-12T13:50:00.000Z'][calls]);
    return Response.json(payload(calls++));
  })(value);
  assert.equal(calls, 2);
});

test('invalid modes, dates, coordinates, stop counts and departure times fail before routing', () => {
  for (const value of [null, {}, {...request(),transport:'Driving'}, {...request(),date:'2026-02-30'},
    {...request(),stops:Array(15).fill(stops[0])}, {...request(),stops:[{...stops[0],lat:0}]},
    {...request(),stops:[{...stops[0],departureMinutes:-1}]}]) assert.throws(() => readItineraryRouteRequest(value));
});

test('failed, empty and malformed routes leave gaps instead of invented lines and hide provider failures', async () => {
  for (const response of [new Response('mock-secret-key', {status:403}), Response.json({routes:[]}),
    Response.json({routes:[{polyline:{geoJsonLinestring:{type:'LineString',coordinates:[[181,0],[0,0]]}}}]})]) {
    const result = await createItineraryRoutesProvider('mock-key', async () => response.clone())(request());
    assert.deepEqual(result.paths, []);
    assert.equal(result.missingLegs, 2);
    assert.ok(!JSON.stringify(result).includes('mock-secret'));
  }
});

test('routing is bounded to three concurrent calls and one shared deadline; co-located stops need no lookup', async () => {
  let active = 0, peak = 0;
  const signals = new Set<AbortSignal | null | undefined>();
  const many = readItineraryRouteRequest({ ...request(), stops: Array.from({length:14}, (_,i) => ({...stops[0],lat:-33.87 - i*.001})) });
  const result = await createItineraryRoutesProvider('mock-key', async (_, options) => {
    signals.add(options?.signal); peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return Response.json(payload(0));
  })(many);
  assert.equal(peak, 3);
  assert.equal(signals.size, 1);
  assert.equal(result.paths.length, 13);
  const same = await createItineraryRoutesProvider('mock-key', async () => assert.fail('No request for a shared location'))(
    readItineraryRouteRequest({...request(),stops:[stops[0],stops[0]]}));
  assert.deepEqual(same.paths, []);
  assert.equal(same.missingLegs, 0);
});
