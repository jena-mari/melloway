import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeTikTokShareUrl } from '@melloway/domain';
import { createSocialLinkHandler, resolveSocialLink, SocialLinkError } from '../server/socialLinks.ts';

const shared = 'https://vt.tiktok.com/ZSbv9H449/';
const full = 'https://www.tiktok.com/@daisypyo/video/7691143357531311391';
const photoShare = 'https://vt.tiktok.com/ZSbvXpjdm/';
const photo = 'https://www.tiktok.com/@nabooresident/photo/7666580140201217311';

test('recognizes copied vt, vm and /t share links without weakening the full URL parser', () => {
  for (const url of [shared, 'https://vm.tiktok.com/ABC123/', 'https://www.tiktok.com/t/ABC123/']) {
    assert.equal(normalizeTikTokShareUrl(` ${url}?share=1#tracking `), url);
  }
  for (const url of ['https://vt.tiktok.com.evil.test/ABC/', 'https://vt.tiktok.com@evil.test/ABC/',
    'https://vt.tiktok.com:443/ABC/', 'https://vt.tiktok.com/../ABC/', 'https://vt.tiktok.com/%41BC/',
    'http://vt.tiktok.com/ABC/', 'https://127.0.0.1/ABC/', 'https://vt.tiktok.com/ABC/extra', full]) {
    assert.equal(normalizeTikTokShareUrl(url), null);
  }
});

test('resolves the supplied share-link shape from HEAD headers and preserves the full numeric video ID', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, shared);
    assert.equal(options?.method, 'HEAD');
    assert.equal(options?.redirect, 'manual');
    return new Response(null, { status: 301, headers: { location: `${full}?share=tracking` } });
  };
  assert.deepEqual(await resolveSocialLink(shared, { fetcher }), {
    platform: 'tiktok', id: '7691143357531311391', normalizedUrl: full,
  });
  assert.equal(calls, 1); // Never request or download the video page itself.
});

test('full video links need no external request', async () => {
  const fetcher: typeof fetch = async () => { assert.fail('must not fetch a full link'); };
  assert.equal((await resolveSocialLink(full, { fetcher })).normalizedUrl, full);
});

test('the phone share link resolves to its photo slideshow without rewriting it as a video or fetching the post', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, photoShare);
    assert.equal(options?.method, 'HEAD');
    return new Response(null, { status: 301, headers: { location: `${photo}?_r=1&_t=tracking` } });
  };
  const expected = { platform: 'tiktok', id: '7666580140201217311', normalizedUrl: photo };
  assert.deepEqual(await resolveSocialLink(photoShare, { fetcher }), expected);
  assert.deepEqual(await resolveSocialLink(photo, { fetcher }), expected);
  assert.equal(calls, 1);
});

test('validates every hop before making a request and rejects foreign, private and insecure destinations', async () => {
  for (const destination of ['http://127.0.0.1/admin', 'https://www.tiktok.com.evil.test/video/1',
    'https://user@vt.tiktok.com/ABC/', 'https://vt.tiktok.com:443/ABC/',
    'http://www.tiktok.com/@daisypyo/video/7691143357531311391',
    'https://www.instagram.com/reel/ABC/', 'file:///etc/passwd']) {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: destination } }); };
    await assert.rejects(resolveSocialLink(shared, { fetcher }), /could not resolve/);
    assert.equal(calls, 1);
  }
});

test('follows known share hosts, rejects loops and caps redirect work', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async url => {
    calls.push(String(url));
    return new Response(null, { status: 302, headers: { location: calls.length === 1 ? 'https://vm.tiktok.com/SECOND/' : full } });
  };
  assert.equal((await resolveSocialLink(shared, { fetcher })).normalizedUrl, full);
  assert.deepEqual(calls, [shared, 'https://vm.tiktok.com/SECOND/']);
  let count = 0;
  const endless: typeof fetch = async () => new Response(null, { status: 302, headers: { location: `https://vt.tiktok.com/HOP${++count}/` } });
  await assert.rejects(resolveSocialLink(shared, { fetcher: endless }), /could not resolve/);
  assert.equal(count, 4);
  const loop: typeof fetch = async () => new Response(null, { status: 302, headers: { location: shared } });
  await assert.rejects(resolveSocialLink(shared, { fetcher: loop }), /could not resolve/);
});

test('times out blocked requests and never returns provider internals', async () => {
  const fetcher: typeof fetch = (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('private provider details')));
  });
  await assert.rejects(resolveSocialLink(shared, { fetcher, timeoutMs: 5 }), error => {
    assert.ok(error instanceof SocialLinkError);
    assert.equal(error.reason, 'timeout');
    assert.doesNotMatch(error.message, /private provider details/);
    return true;
  });
});

test('provider HTTP rejection and a failed connection remain distinguishable for server diagnostics', async () => {
  for (const [fetcher, reason] of [
    [async () => new Response(null, { status: 403 }), 'upstream_http_403'],
    [async () => { throw new Error('private provider details'); }, 'network_failure'],
  ] as const) {
    await assert.rejects(resolveSocialLink(shared, { fetcher }), error => {
      assert.ok(error instanceof SocialLinkError);
      assert.equal(error.status, 502);
      assert.equal(error.reason, reason);
      assert.doesNotMatch(error.message, /private provider details/);
      return true;
    });
  }
});

test('HTTP handler returns the resolved link and rejects invalid or oversized payloads', async () => {
  const handler = createSocialLinkHandler({ fetcher: async () => new Response(null, { status: 301, headers: { location: full } }) });
  for (const [body, expected] of [[JSON.stringify({ url: shared }), 200], ['{', 400], ['null', 400],
    [JSON.stringify({ url: 'https://127.0.0.1/' }), 400], [' '.repeat(4097), 413]] as const) {
    const request = Readable.from([body]) as unknown as IncomingMessage;
    let status = 0;
    let output = '';
    const response = {
      writeHead: (value: number) => { status = value; }, end: (value: string) => { output = value; },
    } as unknown as ServerResponse;
    await handler(request, response);
    assert.equal(status, expected);
    if (expected === 200) assert.equal(JSON.parse(output).video.normalizedUrl, full);
  }
});
