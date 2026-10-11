import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseSocialMediaUrl, type TikTokPlaceSuggestion } from '@melloway/domain';
import { discoverSydneyTikTokPlaces } from '../server/socialDiscovery.ts';
import { matchPlaceResponse, matchTikTokPlace, fetchPlacePoint } from '../server/tiktokPlaceMatching.ts';
import { populateTikTokPlaces, readTikTokCatalogue } from '../server/tiktokPlaceCatalogue.ts';
import { createTikTokPlacesHandler } from '../server/tiktokPlacesMap.ts';
import { mockResponse } from './fixtures/mock-openai-social-discovery.ts';

// All cafés, posts, IDs and provider data below are synthetic. No real API calls or catalogue writes.
const keys = ['OPENAI_API_KEY', 'OPENAI_DISCOVERY_MODEL', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_DEMO_KEY'];
const original = keys.map(key => process.env[key]);
beforeEach(() => {
  process.env.OPENAI_API_KEY = 'mock-openai-secret';
  process.env.OPENAI_DISCOVERY_MODEL = 'gpt-5.6-sol';
  process.env.GOOGLE_MAPS_API_KEY = 'mock-places-secret';
  process.env.GOOGLE_MAPS_DEMO_KEY = 'mock-public-maps-key';
});
afterEach(() => keys.forEach((key, index) => {
  if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index];
}));
const now = () => new Date('2026-10-11T06:00:00.000Z');
const raw = (index: number) => ({ name: `Mock Café ${index}`, suburb: 'Newtown',
  url: `https://www.tiktok.com/@mock_fixture/${index === 2 ? 'photo' : 'video'}/900000000000000000${index}`,
  evidence: `Fictional test fixture: Mock Café ${index} in Newtown. Not a real post.` });
function suggestion(index: number): TikTokPlaceSuggestion {
  const candidate = raw(index);
  const post = parseSocialMediaUrl(candidate.url)!;
  return { name: candidate.name, suburb: candidate.suburb, evidence: candidate.evidence,
    sourceUrl: candidate.url, normalizedUrl: post.normalizedUrl, postId: post.id };
}
function payload(candidates = [raw(1), raw(2)], sources = candidates.map(candidate => candidate.url)) {
  return { ...mockResponse(sources, candidates), usage: { input_tokens: 1200, output_tokens: 300,
    input_tokens_details: { cached_tokens: 200 } } };
}
function googlePlace(index: number) {
  return { id: `ChIJ_MOCK_${index}`, displayName: { text: raw(index).name },
    formattedAddress: `${index} Fictional Test Street, Newtown NSW 2042, Australia`,
    location: { latitude: -33.897 + index / 10000, longitude: 151.179 + index / 10000 },
    businessStatus: 'OPERATIONAL', types: ['cafe', 'food', 'establishment'], addressComponents: [
      { longText: 'Newtown', shortText: 'Newtown', types: ['locality'] },
      { longText: 'New South Wales', shortText: 'NSW', types: ['administrative_area_level_1'] },
      { longText: 'Australia', shortText: 'AU', types: ['country'] },
    ] };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'melloway-mock-tiktok-places-'));
  return { path: join(directory, 'catalogue.json'), cleanup: () => rm(directory, { recursive: true, force: true }) };
}
const fakeFetcher = (candidates = [raw(1), raw(2)]): typeof fetch => async (url, options) => {
  if (String(url) === 'https://api.openai.com/v1/responses') return Response.json(payload(candidates));
  assert.equal(String(url), 'https://places.googleapis.com/v1/places:searchText');
  const query = JSON.parse(String(options?.body)).textQuery as string;
  const index = candidates.find(candidate => query.startsWith(`${candidate.name} `))!.name.match(/\d+$/)![0];
  return Response.json({ places: [googlePlace(Number(index))] });
};

test('one bounded GPT-5.6 search yields different cafés with one TikTok post each and reported usage', async () => {
  let calls = 0;
  const result = await discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'gpt-5.6-sol');
    assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.equal(body.max_tool_calls, 2);
    assert.equal(body.max_output_tokens, 2000);
    assert.equal(body.store, false);
    assert.equal(body.tool_choice, 'required');
    assert.equal(body.parallel_tool_calls, false);
    assert.deepEqual(body.tools[0].filters.allowed_domains, ['tiktok.com']);
    assert.equal(body.tools[0].external_web_access, false);
    assert.equal(body.text.format.schema.properties.candidates.maxItems, 5);
    assert.ok(!String(options?.body).includes('mock-openai-secret'));
    return Response.json(payload([raw(1), raw(2), raw(3), raw(4), raw(5)]));
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.candidates, [1, 2, 3, 4, 5].map(suggestion));
  assert.deepEqual(result.usage, { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 200, webSearchCalls: 1 });
});

test('previous café names and post identities, duplicate cafés, unsourced URLs and weak evidence are excluded', async () => {
  const duplicate = { ...raw(1), url: raw(5).url };
  const previouslySeenPost = { ...raw(3), url: raw(2).url };
  const weakEvidence = { ...raw(4), evidence: 'Mock Café 4, no suburb mentioned' };
  let input: { excluded: unknown[] } | undefined;
  const result = await discoverSydneyTikTokPlaces('Sydney cafés', [suggestion(2)], { fetcher: async (_url, options) => {
    input = JSON.parse(JSON.parse(String(options?.body)).input[0].content);
    return Response.json(payload([raw(1), duplicate, previouslySeenPost, weakEvidence, raw(6)],
      [raw(1).url, duplicate.url, previouslySeenPost.url, weakEvidence.url]));
  } });
  assert.equal(input!.excluded.length, 1);
  assert.deepEqual(result.candidates.map(place => place.name), [raw(1).name]);
  const links = ['https://vt.tiktok.com/MOCK/', 'https://instagram.com/reel/MOCK/', 'https://tiktok.com/@mock_fixture'];
  assert.deepEqual((await discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async () =>
    Response.json(payload(links.map(url => ({ ...raw(1), url })), links)) })).candidates, []);
});

test('empty, incomplete and excessive discovery output never becomes invented cafés', async () => {
  assert.deepEqual((await discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async () => Response.json(payload([])) })).candidates, []);
  for (const response of [{ ...payload(), status: 'incomplete' }, payload(Array.from({ length: 6 }, () => raw(1)))]) {
    await assert.rejects(discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async () => Response.json(response) }), /invalid or incomplete/);
  }
});

test('omitted optional search sources supply no café evidence and do not discard another sourced result', async () => {
  const withoutSources = payload();
  Reflect.deleteProperty(withoutSources.output[0].action!, 'sources');
  let calls = 0;
  const missing = await discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async () => {
    calls++; return Response.json(withoutSources);
  } });
  assert.deepEqual(missing.candidates, []);
  assert.equal(calls, 1);
  const sourced = payload([raw(1)]);
  sourced.output.splice(1, 0, withoutSources.output[0]);
  const mixed = await discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async () => Response.json(sourced) });
  assert.deepEqual(mixed.candidates, [suggestion(1)]);
  assert.equal(mixed.usage!.webSearchCalls, 2);
  for (const sources of [null, 'invalid', {}]) {
    const malformed = payload();
    malformed.output[0].action!.sources = sources as unknown as [];
    await assert.rejects(discoverSydneyTikTokPlaces('Sydney cafés', [], { fetcher: async () => Response.json(malformed) }),
      /invalid or incomplete/);
  }
});

test('Google matching requires one exact name/suburb match in NSW, Australia; it never uses the nearest result', () => {
  const place = googlePlace(1);
  assert.equal(matchPlaceResponse(suggestion(1), { places: [place] }).status, 'matched');
  assert.equal(matchPlaceResponse({ name: 'Mock Cafe 1', suburb: 'NEWTOWN' }, { places: [place] }).status, 'matched');
  for (const wrong of [
    { ...place, displayName: { text: 'Other Café' } },
    { ...place, addressComponents: place.addressComponents.slice(1) },
    { ...place, addressComponents: place.addressComponents.map(part => part.shortText === 'AU' ? { ...part, shortText: 'NZ', longText: 'New Zealand' } : part) },
    { ...place, location: { latitude: -37.8, longitude: 144.9 } },
    { ...place, location: { latitude: NaN, longitude: 151.1 } },
    { ...place, businessStatus: 'CLOSED_PERMANENTLY' },
    { ...place, types: ['parking'] },
  ]) assert.deepEqual(matchPlaceResponse(suggestion(1), { places: [wrong] }), { status: 'unmatched', reason: 'no_clear_match' });
  assert.deepEqual(matchPlaceResponse(suggestion(1), { places: [place, { ...place, id: 'ChIJ_MOCK_ANOTHER' }] }),
    { status: 'unmatched', reason: 'ambiguous' });
  assert.equal(matchPlaceResponse(suggestion(1), { places: [place, place] }).status, 'matched');
  assert.throws(() => matchPlaceResponse(suggestion(1), { places: {} }), /Invalid/);
});

test('Google requests use only the server key, bounded fields and correct text search/details URLs', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('X-Goog-Api-Key'), 'mock-places-secret');
    assert.ok(!headers.get('X-Goog-FieldMask')!.includes('*'));
    assert.ok(!String(url).includes('mock-'));
    assert.equal(options?.redirect, 'error');
    if (calls === 1) {
      assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
      assert.equal(options?.method, 'POST');
      assert.equal(JSON.parse(String(options?.body)).pageSize, 5);
      assert.match(JSON.parse(String(options?.body)).textQuery, /Mock Café 1 Newtown Sydney NSW Australia/);
      return Response.json({ places: [googlePlace(1)] });
    }
    assert.equal(url, 'https://places.googleapis.com/v1/places/ChIJ_MOCK_1');
    assert.equal(options?.method, 'GET');
    return Response.json(googlePlace(1));
  };
  assert.equal((await matchTikTokPlace(suggestion(1), fetcher)).status, 'matched');
  assert.equal((await fetchPlacePoint('ChIJ_MOCK_1', fetcher))!.placeId, 'ChIJ_MOCK_1');
  assert.equal(await fetchPlacePoint('ChIJ_MOCK_1', async () => Response.json(googlePlace(2))), null);
  delete process.env.GOOGLE_MAPS_API_KEY;
  await assert.rejects(matchTikTokPlace(suggestion(1), fetcher), /server-side GOOGLE_MAPS_API_KEY/);
  assert.equal(calls, 2);
});

test('Google failures expose no provider text or credentials and perform no retry', async () => {
  let calls = 0;
  await assert.rejects(matchTikTokPlace(suggestion(1), async () => {
    calls++; return new Response('private provider body mock-places-secret', { status: 403 });
  }), { message: 'Google Places returned HTTP 403.' });
  await assert.rejects(matchTikTokPlace(suggestion(1), async () => {
    calls++; throw new Error('mock-places-secret');
  }), { message: 'Google Places location lookup failed.' });
  assert.equal(calls, 2);
});

test('five different matches save only place IDs plus TikTok metadata, and query reruns spend zero calls', async () => {
  const f = await fixture();
  let calls = 0;
  try {
    const fetcher: typeof fetch = async (url, options) => {
      calls++;
      if (calls === 1) assert.equal((await readTikTokCatalogue(f.path)).runs[0].status, 'started');
      return fakeFetcher([raw(1), raw(2), raw(3), raw(4), raw(5)])(url, options);
    };
    const result = await populateTikTokPlaces('Sydney cafés', { filePath: f.path, fetcher, now });
    assert.equal(result.skipped, false);
    assert.equal(result.total, 5);
    assert.equal(result.run.status, 'completed');
    assert.equal(calls, 6);
    const data = await readTikTokCatalogue(f.path);
    assert.deepEqual(data.places.map(place => place.placeId), [1, 2, 3, 4, 5].map(index => `ChIJ_MOCK_${index}`));
    const contents = await readFile(f.path, 'utf8');
    for (const forbidden of ['latitude', 'longitude', 'formattedAddress', 'Fictional Test Street', 'secret']) assert.ok(!contents.includes(forbidden));
    assert.ok(data.places.every(place => place.reviewStatus === 'pending'));
    if (process.platform !== 'win32') assert.equal((await stat(f.path)).mode & 0o777, 0o600);
    process.env.OPENAI_DISCOVERY_MODEL = 'another-model';
    const repeated = await populateTikTokPlaces('  SYDNEY   CAFÉS ', { filePath: f.path, fetcher, now });
    assert.equal(repeated.skipped, true);
    assert.equal(calls, 6);
    assert.equal(await readFile(f.path, 'utf8'), contents);
  } finally { await f.cleanup(); }
});

test('unmatched and already saved cafés/posts are excluded from later searches; zero results are remembered', async () => {
  const f = await fixture();
  try {
    await populateTikTokPlaces('first query', { filePath: f.path, now, fetcher: async (url, options) => {
      if (String(url).includes('api.openai.com')) return Response.json(payload());
      const name = JSON.parse(String(options?.body)).textQuery;
      return Response.json({ places: name.includes('Café 1') ? [googlePlace(1)] : [] });
    } });
    let calls = 0;
    const fetcher: typeof fetch = async (_url, options) => {
      calls++;
      const input = JSON.parse(JSON.parse(String(options?.body)).input[0].content);
      assert.deepEqual(input.excluded.map((place: { name: string }) => place.name), [raw(1).name, raw(2).name]);
      return Response.json(payload());
    };
    const result = await populateTikTokPlaces('second query', { filePath: f.path, now, fetcher });
    assert.equal(result.run.found, 0);
    assert.equal(result.total, 1);
    assert.equal(result.run.unmatched.length, 0);
    assert.equal((await populateTikTokPlaces('second query', { filePath: f.path, now, fetcher })).skipped, true);
    assert.equal(calls, 1);
  } finally { await f.cleanup(); }
});

test('explicit retries retain empty and failed attempts, use the latest attempt, and stop after success', async () => {
  const f = await fixture();
  let calls = 0;
  try {
    await populateTikTokPlaces('Sydney cafés', { filePath: f.path, now, fetcher: async () => {
      calls++; return Response.json(payload([]));
    } });
    const originalRun = (await readTikTokCatalogue(f.path)).runs[0];
    assert.equal((await populateTikTokPlaces(' SYDNEY  CAFÉS ', { filePath: f.path, now,
      fetcher: async () => { assert.fail('Default rerun must not spend a call'); } })).skipped, true);
    await assert.rejects(populateTikTokPlaces(' SYDNEY  CAFÉS ', { filePath: f.path, now, retry: true,
      fetcher: async () => { calls++; return new Response('private provider body', { status: 429 }); } }), /HTTP 429/);
    const retried = await populateTikTokPlaces('Sydney cafés', { filePath: f.path, now, retry: true,
      fetcher: async (url, options) => {
        calls++; return fakeFetcher([raw(1), raw(2), raw(3), raw(4), raw(5)])(url, options);
      } });
    assert.equal(retried.skipped, false);
    assert.equal(retried.total, 5);
    assert.equal(calls, 8);
    const catalogue = await readTikTokCatalogue(f.path);
    assert.deepEqual(catalogue.runs.map(run => run.status), ['completed', 'failed', 'completed']);
    assert.deepEqual(catalogue.runs[0], originalRun);
    const unchanged = await readFile(f.path, 'utf8');
    for (const retry of [false, true]) {
      const skipped = await populateTikTokPlaces(' SYDNEY  CAFÉS ', { filePath: f.path, now, retry,
        fetcher: async () => { assert.fail('A successful batch must not run again'); } });
      assert.equal(skipped.skipped, true);
      assert.deepEqual(skipped.run, catalogue.runs[2]);
    }
    assert.equal(await readFile(f.path, 'utf8'), unchanged);
  } finally { await f.cleanup(); }
});

test('retrying a matching failure reconsiders its candidate, excludes saved and other-query posts, and clears resolved warnings', async () => {
  const f = await fixture();
  try {
    await populateTikTokPlaces('first query', { filePath: f.path, now, fetcher: async (url, options) => {
      if (String(url).includes('api.openai.com')) return Response.json(payload([raw(1), raw(2)]));
      return JSON.parse(String(options?.body)).textQuery.includes('Café 1')
        ? Response.json({ places: [googlePlace(1)] }) : new Response('private provider body', { status: 503 });
    } });
    await populateTikTokPlaces('other query', { filePath: f.path, now, fetcher: async url =>
      String(url).includes('api.openai.com') ? Response.json(payload([raw(3)])) : Response.json({ places: [] }) });
    let searchCalls = 0;
    let googleCalls = 0;
    const retried = await populateTikTokPlaces(' FIRST  QUERY ', { filePath: f.path, now, retry: true,
      fetcher: async (url, options) => {
        if (String(url).includes('api.openai.com')) {
          searchCalls++;
          const input = JSON.parse(JSON.parse(String(options?.body)).input[0].content);
          assert.deepEqual(input.excluded.map((entry: { postId: string }) => entry.postId), [suggestion(1).postId, suggestion(3).postId]);
          return Response.json(payload([raw(1), raw(2), raw(3)]));
        }
        googleCalls++;
        assert.match(JSON.parse(String(options?.body)).textQuery, /Mock Café 2 Newtown/);
        return Response.json({ places: [googlePlace(2)] });
      } });
    assert.equal(retried.total, 2);
    assert.equal(retried.skipped, false);
    if (!retried.skipped) assert.equal(retried.added, 1);
    assert.equal(searchCalls, 1);
    assert.equal(googleCalls, 1);
    const catalogue = await readTikTokCatalogue(f.path);
    assert.equal(catalogue.runs.length, 3);
    assert.equal(catalogue.runs[0].unmatched[0].reason, 'lookup_failed');
    assert.deepEqual(catalogue.places.map(place => place.postId), [suggestion(1).postId, suggestion(2).postId]);
    const handler = createTikTokPlacesHandler({ filePath: f.path, fetcher: async url =>
      Response.json(googlePlace(Number(String(url).match(/\d+$/)![0]))) });
    assert.equal(JSON.parse((await request(handler, '/api/tiktok-places')).body).unmatchedCount, 1);
  } finally { await f.cleanup(); }
});

test('duplicate Google place IDs create only one pin; failed matching is retained without fabricated coordinates', async () => {
  const f = await fixture();
  try {
    const result = await populateTikTokPlaces('Sydney cafés', { filePath: f.path, now, fetcher: async (url, options) => {
      if (String(url).includes('api.openai.com')) return Response.json(payload([raw(1), raw(2), raw(3)]));
      const query = JSON.parse(String(options?.body)).textQuery;
      if (query.includes('Café 3')) return new Response('secret', { status: 502 });
      const index = query.includes('Café 1') ? 1 : 2;
      return Response.json({ places: [{ ...googlePlace(index), id: 'ChIJ_SHARED_MOCK' }] });
    } });
    assert.equal(result.total, 1);
    assert.deepEqual(result.run.unmatched.map(entry => entry.reason), ['duplicate_place', 'lookup_failed']);
    assert.ok(!(await readFile(f.path, 'utf8')).includes('secret'));
  } finally { await f.cleanup(); }
});

test('missing Places credentials, malformed storage and symlinks fail before any paid API request', async () => {
  const f = await fixture();
  const fetcher: typeof fetch = async () => { assert.fail('Unexpected paid request'); };
  try {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await assert.rejects(populateTikTokPlaces('Sydney cafés', { filePath: f.path, fetcher }), /No paid lookup was made/);
    process.env.GOOGLE_MAPS_API_KEY = 'mock-places-secret';
    await writeFile(f.path, '{broken');
    await assert.rejects(populateTikTokPlaces('Sydney cafés', { filePath: f.path, fetcher }), /not reset/);
    assert.equal(await readFile(f.path, 'utf8'), '{broken');
    await rm(f.path);
    await writeFile(`${f.path}.target`, JSON.stringify({ version: 1, places: [], runs: [] }));
    await symlink(`${f.path}.target`, f.path);
    await assert.rejects(populateTikTokPlaces('Sydney cafés', { filePath: f.path, fetcher }), /not reset/);
  } finally { await f.cleanup(); }
});

test('failed or interrupted searches remain remembered and simultaneous population cannot spend twice', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    await assert.rejects(populateTikTokPlaces('failed query', { filePath: f.path, now, fetcher: async () => {
      calls++; return new Response('private mock-openai-secret', { status: 429 });
    } }), /HTTP 429/);
    assert.equal((await readTikTokCatalogue(f.path)).runs[0].status, 'failed');
    assert.equal((await populateTikTokPlaces('failed query', { filePath: f.path, now, fetcher: fakeFetcher() })).skipped, true);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const hasStarted = new Promise<void>(resolve => { started = resolve; });
    const first = populateTikTokPlaces('concurrent query', { filePath: f.path, now, fetcher: async () => {
      calls++; started(); await gate; return Response.json(payload([]));
    } });
    await hasStarted;
    await assert.rejects(populateTikTokPlaces('concurrent query', { filePath: f.path, now, fetcher: fakeFetcher() }), /busy/);
    await assert.rejects(populateTikTokPlaces('concurrent query', { filePath: f.path, now, retry: true, fetcher: fakeFetcher() }), /busy/);
    release(); await first;
    assert.equal(calls, 2);
    const data = await readTikTokCatalogue(f.path);
    data.runs[1].status = 'started'; data.runs[1].finishedAt = null;
    await writeFile(f.path, JSON.stringify(data));
    assert.equal((await populateTikTokPlaces('concurrent query', { filePath: f.path, now, fetcher: fakeFetcher() })).skipped, true);
    assert.equal((await populateTikTokPlaces('concurrent query', { filePath: f.path, now, retry: true, fetcher: fakeFetcher() })).skipped, true);
    assert.equal(calls, 2);
    assert.ok(!(await readFile(f.path, 'utf8')).includes('secret'));
  } finally { await f.cleanup(); }
});

async function request(handler: ReturnType<typeof createTikTokPlacesHandler>, url: string) {
  let status = 0;
  let body = '';
  const response = { writeHead(code: number) { status = code; }, end(value: string) { body = value; } } as unknown as ServerResponse;
  await handler({ url } as IncomingMessage, response);
  return { status, body };
}
test('map browsing fetches fresh Google details but never OpenAI; failed details retain links without pins', async () => {
  const f = await fixture();
  try {
    await populateTikTokPlaces('Sydney cafés', { filePath: f.path, fetcher: fakeFetcher(), now });
    let calls = 0;
    const handler = createTikTokPlacesHandler({ filePath: f.path, fetcher: async url => {
      calls++;
      assert.match(String(url), /^https:\/\/places.googleapis.com\/v1\/places\/ChIJ_MOCK_/);
      return String(url).endsWith('_1') ? Response.json(googlePlace(1)) : new Response('secret', { status: 503 });
    } });
    const list = await request(handler, '/api/tiktok-places');
    assert.equal(list.status, 200);
    const data = JSON.parse(list.body);
    assert.equal(data.places.length, 2);
    assert.equal(data.missingCoordinates, 1);
    assert.equal(data.places[1].latitude, null);
    assert.equal(data.places[1].sourceUrl, raw(2).url);
    assert.ok(!list.body.includes('mock-places-secret'));
    const map = await request(handler, '/api/tiktok-places-map?v=1');
    assert.equal(map.status, 200);
    assert.match(map.body, /TikTok/);
    assert.ok(map.body.includes('mock-public-maps-key'));
    assert.ok(!map.body.includes('mock-places-secret'));
    assert.ok(map.body.includes('"label":"A"'));
    assert.ok(!map.body.includes('"label":"B"'));
    assert.equal(calls, 4);
    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.equal(JSON.parse((await request(handler, '/api/tiktok-places')).body).missingCoordinates, 2);
    assert.equal((await request(handler, '/api/tiktok-places-map')).status, 503);
    assert.equal(calls, 4);
  } finally { await f.cleanup(); }
});

test('empty catalogue and corrupt catalogue never display fabricated pins', async () => {
  const f = await fixture();
  try {
    const handler = createTikTokPlacesHandler({ filePath: f.path, fetcher: async () => { assert.fail('Unexpected provider request'); } });
    assert.deepEqual(JSON.parse((await request(handler, '/api/tiktok-places')).body).places, []);
    assert.equal((await request(handler, '/api/tiktok-places-map')).status, 404);
    await writeFile(f.path, '{bad');
    assert.equal((await request(handler, '/api/tiktok-places')).status, 502);
  } finally { await f.cleanup(); }
});
