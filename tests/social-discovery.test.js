import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSocialVideos } from '@melloway/domain';
import { mockCafe, mockSources, mockNow } from './fixtures/mock-social-discovery.js';

const mockProvider = (sources) => ({ mode: 'mock', async search() { return sources; } });
const discover = (sources) => discoverSocialVideos(mockCafe, mockProvider(sources), mockNow);

test('mock discovery returns normalized, traceable pending candidates with supplied evidence', async () => {
  let calls = 0;
  const candidates = await discoverSocialVideos(mockCafe, { mode: 'mock', async search(input) {
    calls += 1;
    assert.deepEqual(input, mockCafe);
    return mockSources;
  } }, mockNow);
  assert.equal(calls, 1);
  assert.deepEqual(candidates[0], {
    venueId: mockCafe.venueId, platform: 'tiktok', postId: '9000000000000000001',
    normalizedUrl: 'https://www.tiktok.com/@mock_fixture/video/9000000000000000001',
    sourceUrl: mockSources[0].url,
    matchExplanation: `Search text mentions "Mock Café (Test)" and "Newtown": ${mockSources[0].title} ${mockSources[0].snippet}`,
    uncertainty: 'Search text only; venue identity, location and video content have not been verified.',
    discoveredAt: mockNow().toISOString(), status: 'pending',
  });
  assert.equal(candidates[1].platform, 'instagram');
  assert.equal(candidates[1].postId, 'MOCK_Reel-2');
  assert.equal(candidates[1].normalizedUrl, 'https://www.instagram.com/reel/MOCK_Reel-2/');
  assert.equal(candidates.length, 2);
  for (const candidate of candidates) assert.ok(mockSources.some(source => source.url === candidate.sourceUrl));
});

test('duplicates use platform and post ID for the venue, retaining the first evidenced source', async () => {
  const candidates = await discover([
    mockSources[0],
    { ...mockSources[0], url: 'https://www.tiktok.com/@different_fixture/video/9000000000000000001#duplicate' },
    mockSources[1], mockSources[1],
    { ...mockSources[1], url: 'https://instagram.com/reel/9000000000000000001/' },
  ]);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].sourceUrl, mockSources[0].url);
  assert.deepEqual(candidates.map(candidate => candidate.platform), ['tiktok', 'instagram', 'instagram']);
  const otherVenue = await discoverSocialVideos({ ...mockCafe, venueId: 'another-mock-venue' }, mockProvider(mockSources), mockNow);
  assert.equal(otherVenue.length, 2);
  assert.ok(otherVenue.every(candidate => candidate.venueId === 'another-mock-venue'));
});

test('unsupported, shortened and malformed links are rejected without invented replacements', async () => {
  const sources = ['https://youtube.com/shorts/MOCK', 'https://vm.tiktok.com/MOCK/',
    'https://instagram.com/p/MOCK/', 'https://tiktok.com/@fixture/video/not-numeric',
    'https://www.instagram.com.evil.example/reel/MOCK/', '', null];
  assert.deepEqual(await discover(sources.map(url => ({ ...mockSources[0], url }))), []);
});

test('missing evidence, wrong names/suburbs and partial phrase matches are rejected', async () => {
  const sources = [
    { url: mockSources[0].url },
    { ...mockSources[0], title: '', snippet: ' ' },
    { ...mockSources[0], title: mockCafe.name, snippet: 'Somewhere in Sydney' },
    { ...mockSources[0], title: mockCafe.suburb, snippet: 'Another café' },
    { ...mockSources[0], title: `Other${mockCafe.name}`, snippet: mockCafe.suburb },
    { ...mockSources[0], title: mockCafe.name, snippet: 'Newtownish' },
  ];
  assert.deepEqual(await discover(sources), []);
  // An unevidenced first occurrence must not hide a later evidenced duplicate.
  assert.equal((await discover([sources[0], mockSources[0]])).length, 1);
});

test('evidence matching handles case, whitespace, Unicode and literal name punctuation', async () => {
  const candidates = await discover([{ ...mockSources[0], title: 'MOCK CAFE\u0301 (TEST),', snippet: '\nNEWTOWN\t' }]);
  assert.equal(candidates.length, 1);
});

test('zero mock results remain empty', async () => {
  assert.deepEqual(await discover([]), []);
});

test('caps output at five evidenced unique results in source order', async () => {
  const sources = Array.from({ length: 8 }, (_, index) => ({ ...mockSources[1], url: `https://instagram.com/reel/MOCK_${index}/` }));
  const candidates = await discover([ { ...mockSources[0], title: '', snippet: '' }, sources[0], sources[0], ...sources.slice(1) ]);
  assert.deepEqual(candidates.map(candidate => candidate.postId), ['MOCK_0', 'MOCK_1', 'MOCK_2', 'MOCK_3', 'MOCK_4']);
  assert.ok(candidates.every(candidate => sources.some(source => source.url === candidate.sourceUrl)));
});

test('invalid café input and non-mock providers fail before searching', async () => {
  let calls = 0;
  const provider = { mode: 'mock', async search() { calls += 1; return mockSources; } };
  for (const cafe of [null, { ...mockCafe, venueId: '' }, { ...mockCafe, name: ' ' }, { ...mockCafe, suburb: null }]) {
    await assert.rejects(discoverSocialVideos(cafe, provider, mockNow), /venue ID, exact name and Sydney suburb/);
  }
  await assert.rejects(discoverSocialVideos(mockCafe, { ...provider, mode: 'live' }, mockNow), /mock search only/);
  assert.equal(calls, 0);
});

test('provider errors and malformed responses are surfaced, with no fixture fallback', async () => {
  await assert.rejects(discoverSocialVideos(mockCafe, { mode: 'mock', async search() { throw new Error('Mock provider failed'); } }, mockNow), /Mock provider failed/);
  await assert.rejects(discover(null), /list of sources/);
});
