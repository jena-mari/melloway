import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSocialLink } from '../../apps/mobile/src/services/socialLinks.ts';

const shared = 'https://vt.tiktok.com/ZSbv9H449/';
const full = 'https://www.tiktok.com/@daisypyo/video/7691143357531311391';
const video = { platform: 'tiktok', id: '7691143357531311391', normalizedUrl: full };

test('mobile and web send copied TikTok links to the configured absolute API and validate the resolved ID', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://api.melloway.test/api/social-link');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(String(options.body)), { url: shared });
    return Response.json({ video });
  });
  assert.deepEqual(await resolveSocialLink(`${shared}?tracking=1`, { origin: 'https://api.melloway.test' }), video);
});

test('mobile accepts a resolved photo slideshow and preserves its original post URL', async t => {
  const photo = { platform: 'tiktok', id: '7666580140201217311',
    normalizedUrl: 'https://www.tiktok.com/@nabooresident/photo/7666580140201217311' };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ video: photo }));
  assert.deepEqual(await resolveSocialLink('https://vt.tiktok.com/ZSbvXpjdm/', { origin: 'https://api.melloway.test' }), photo);
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('full photo posts must work offline'); });
  assert.deepEqual(await resolveSocialLink(photo.normalizedUrl), photo);
});

test('full links work offline without API configuration and bad formats make no request', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('must not fetch'); });
  assert.deepEqual(await resolveSocialLink(full), video);
  for (const input of ['', 'https://vt.tiktok.com.evil.test/ABC/', 'not a link']) {
    await assert.rejects(resolveSocialLink(input), /Paste/);
  }
});

test('resolver failures and mismatched/foreign responses never produce a playable video', async t => {
  for (const data of [{ video: { ...video, id: '1' } }, { video: { ...video, platform: 'instagram' } },
    { video: { ...video, normalizedUrl: 'https://evil.test/video' } }, null]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(data));
    await assert.rejects(resolveSocialLink(shared, { origin: 'https://api.melloway.test' }), /invalid video/);
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 502 }));
  await assert.rejects(resolveSocialLink(shared, { origin: 'https://api.melloway.test' }), /could not resolve/);
});

test('a cancelled request aborts the link lookup', async t => {
  t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new TypeError('aborted')));
  }));
  const controller = new AbortController();
  const pending = resolveSocialLink(shared, { origin: 'https://api.melloway.test', signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /could not be reached/);
});

test('HTTP errors distinguish a missing backend, rate limits and provider failure without exposing response bodies', async t => {
  for (const [status, message] of [
    [404, /does not have the link service \(HTTP 404\)/],
    [429, /HTTP 429\).*Wait a minute/],
    [502, /TikTok could not resolve this share link \(HTTP 502\)/],
    [503, /link service could not check this link \(HTTP 503\)/],
  ] as const) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'private provider details' }, { status }));
    await assert.rejects(resolveSocialLink(shared, { origin: 'https://api.melloway.test' }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, message);
      assert.doesNotMatch(error.message, /private provider details/);
      return true;
    });
  }
});
