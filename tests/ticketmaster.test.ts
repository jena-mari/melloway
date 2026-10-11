import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fetchSydneyEvents } from '../server/ticketmaster.ts';

const now = new Date('2026-10-11T00:00:00Z');
const fakeKey = 'mock-secret-key';
const previousKey = process.env.TICKETMASTER_API_KEY;
beforeEach(() => { process.env.TICKETMASTER_API_KEY = fakeKey; });
afterEach(() => {
  if (previousKey === undefined) delete process.env.TICKETMASTER_API_KEY;
  else process.env.TICKETMASTER_API_KEY = previousKey;
});

// Synthetic fixtures only; these do not describe real events.
function event() {
  return {
    id: 'mock-event', name: 'Mock Sydney event', url: 'https://www.ticketmaster.com.au/event/mock-event',
    dates: { start: { localDate: '2026-10-12', localTime: '19:00:00', dateTime: '2026-10-12T08:00:00Z',
      dateTBA: false, dateTBD: false, timeTBA: false, noSpecificTime: false },
    timezone: 'Australia/Sydney', status: { code: 'onsale' } },
    _embedded: { venues: [{ name: 'Mock venue', address: { line1: '1 Mock Street', line2: 'Level 2' },
      city: { name: 'Sydney' }, state: { stateCode: 'NSW' }, postalCode: '2000', country: { name: 'Australia' },
      location: { latitude: '-33.86', longitude: '151.21' }, timezone: 'Australia/Sydney' }] },
    classifications: [{ primary: false, segment: { name: 'Other' } },
      { primary: true, segment: { name: 'Music' } }],
    priceRanges: [{ min: 25, max: 80, currency: 'AUD' }, { min: 100, max: 150, currency: 'AUD' }],
  };
}
function mockResults(events: unknown[]): typeof fetch {
  return async () => Response.json({ _embedded: { events } });
}

test('fetches Sydney/AU within 30 days and normalizes all available fields', async () => {
  let calls = 0;
  const results = await fetchSydneyEvents({ now, fetcher: async (input, options) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://app.ticketmaster.com/discovery/v2/events.json');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      apikey: fakeKey, city: 'Sydney', countryCode: 'AU', source: 'ticketmaster',
      startDateTime: '2026-10-11T00:00:00Z', endDateTime: '2026-11-10T00:00:00Z',
      includeTBA: 'no', includeTBD: 'no', size: '10', sort: 'date,asc',
    });
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({ _embedded: { events: [event()] } });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(results, [{
    id: 'mock-event', name: 'Mock Sydney event', startDate: '2026-10-12', startTime: '19:00:00',
    startDateTime: '2026-10-12T08:00:00Z', timezone: 'Australia/Sydney',
    venue: { name: 'Mock venue', address: '1 Mock Street, Level 2, Sydney, NSW, 2000, Australia',
      latitude: -33.86, longitude: 151.21 },
    category: 'Music', url: 'https://www.ticketmaster.com.au/event/mock-event',
    priceRanges: [{ min: 25, max: 80, currency: 'AUD' }, { min: 100, max: 150, currency: 'AUD' }],
  }]);
});

test('missing optional values and absent prices are null, never invented', async () => {
  const [result] = await fetchSydneyEvents({ now, fetcher: mockResults([
    { id: 'date-only', name: 'Mock date-only event', dates: { start: { localDate: '2026-10-12' } } },
  ]) });
  assert.deepEqual(result, { id: 'date-only', name: 'Mock date-only event', startDate: '2026-10-12',
    startTime: null, startDateTime: null, timezone: null, venue: null, category: null, url: null, priceRanges: null });
});

test('partial venue and prices preserve known zero values without fabricating currency', async () => {
  const [result] = await fetchSydneyEvents({ now, fetcher: mockResults([{ ...event(),
    dates: { start: event().dates.start },
    _embedded: { venues: [{ timezone: 'Australia/Sydney', location: { latitude: '0', longitude: '' } }] },
    priceRanges: [{ min: 0 }, { max: 12, currency: 'AUD' }],
  }]) });
  assert.equal(result.timezone, 'Australia/Sydney');
  assert.deepEqual(result.venue, { name: null, address: null, latitude: 0, longitude: null });
  assert.deepEqual(result.priceRanges, [{ min: 0, max: null, currency: null }, { min: null, max: 12, currency: 'AUD' }]);
});

test('empty or nonnumeric price ranges remain null and invalid coordinates do not become zero', async () => {
  for (const priceRanges of [[], [{ currency: 'AUD' }], [{ min: -5, max: '20' }]]) {
    const [result] = await fetchSydneyEvents({ now, fetcher: mockResults([{ ...event(), priceRanges,
      _embedded: { venues: [{ location: { latitude: 'not-number', longitude: '181' } }] },
    }]) });
    assert.equal(result.priceRanges, null);
    assert.equal(result.venue?.latitude, null);
    assert.equal(result.venue?.longitude, null);
  }
});

test('excludes cancelled, postponed, TBA/TBD, missing and invalid dates', async () => {
  const invalid = [
    ...['canceled', 'cancelled', 'postponed'].map(code => ({ ...event(), dates: { ...event().dates, status: { code } } })),
    ...[{ dateTBA: true }, { dateTBD: true }, { localDate: '' }, { localDate: '2026-02-30' }]
      .map(start => ({ ...event(), dates: { ...event().dates, start: { ...event().dates.start, ...start } } })),
    { ...event(), dates: {} }, { ...event(), id: '' },
  ];
  assert.deepEqual(await fetchSydneyEvents({ now, fetcher: mockResults(invalid) }), []);
});

test('confirmed dates with TBA or unspecified time do not expose placeholder times', async () => {
  for (const flags of [{ timeTBA: true }, { noSpecificTime: true }]) {
    const [result] = await fetchSydneyEvents({ now, fetcher: mockResults([{ ...event(),
      dates: { ...event().dates, start: { ...event().dates.start, ...flags } },
    }]) });
    assert.equal(result.startDate, '2026-10-12');
    assert.equal(result.startTime, null);
    assert.equal(result.startDateTime, null);
  }
});

test('filters exact window boundaries and rejects timestamps without offsets', async () => {
  const times = ['2026-10-10T23:59:59Z', '2026-10-11T00:00:00Z', '2026-11-10T00:00:00Z',
    '2026-11-10T00:00:01Z', 'invalid', '2026-10-12T19:00:00'];
  const results = await fetchSydneyEvents({ now, fetcher: mockResults(times.map((dateTime, i) => ({
    ...event(), id: String(i), dates: { ...event().dates, start: { ...event().dates.start, dateTime } },
  }))) });
  assert.deepEqual(results.map(e => e.id), ['1', '2']);
});

test('date-only filtering uses Sydney dates across UTC midnight and daylight saving', async () => {
  const results = await fetchSydneyEvents({ now: new Date('2026-10-03T14:30:00Z'),
    fetcher: mockResults(['2026-10-03', '2026-10-04', '2026-11-03', '2026-11-04'].map(localDate => ({
      id: localDate, name: 'Mock date', dates: { start: { localDate } },
    }))) });
  assert.deepEqual(results.map(e => e.startDate), ['2026-10-04', '2026-11-03']);
});

test('returns at most ten events even if the provider returns more', async () => {
  const results = await fetchSydneyEvents({ now, fetcher: mockResults(Array.from({ length: 12 }, (_, i) => ({
    ...event(), id: String(i),
  }))) });
  assert.equal(results.length, 10);
});

test('empty results return an empty array without demo substitutions', async () => {
  for (const payload of [{ page: { totalElements: 0 } }, { _embedded: { events: [] } }]) {
    assert.deepEqual(await fetchSydneyEvents({ now, fetcher: async () => Response.json(payload) }), []);
  }
});

test('HTTP errors report only the status, never the response body or key', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(fetchSydneyEvents({ now, fetcher: async () =>
      new Response(`private provider error ${fakeKey}`, { status }) }),
    { message: `Ticketmaster API returned HTTP ${status}.` });
  }
});

test('network and timeout errors discard any URL or secret in the underlying error', async () => {
  for (const name of ['Error', 'TimeoutError']) {
    await assert.rejects(fetchSydneyEvents({ now, fetcher: async () => {
      const error = new Error(`https://app.ticketmaster.com/?apikey=${fakeKey}`);
      error.name = name;
      throw error;
    } }), error => {
      assert.equal((error as Error).message, 'Ticketmaster request failed or timed out.');
      assert.equal((error as Error).cause, undefined);
      assert.ok(!String(error).includes(fakeKey));
      return true;
    });
  }
});

test('invalid JSON and malformed payloads are errors rather than empty results', async () => {
  for (const response of [new Response('not-json'), Response.json(null), Response.json({ _embedded: { events: {} } }),
    Response.json({ fault: { faultstring: fakeKey } }), Response.json({ errors: [{ message: fakeKey }] })]) {
    await assert.rejects(fetchSydneyEvents({ now, fetcher: async () => response }),
      { message: 'Ticketmaster returned an invalid response.' });
  }
});

test('missing key fails before fetch and explains configuration', async () => {
  process.env.TICKETMASTER_API_KEY = ' ';
  let called = false;
  await assert.rejects(fetchSydneyEvents({ now, fetcher: async () => {
    called = true; return Response.json({});
  } }), /Set TICKETMASTER_API_KEY/);
  assert.equal(called, false);
});

test('runner exits with a safe missing-key message and no events', () => {
  const env = { ...process.env };
  delete env.TICKETMASTER_API_KEY;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/fetch-sydney-events.ts'],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Set TICKETMASTER_API_KEY/);
  assert.ok(!result.stderr.includes(fakeKey));
});
