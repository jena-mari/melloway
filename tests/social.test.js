import test from "node:test";
import assert from "node:assert/strict";
import { socialPost, socialEmbed } from "../src/utils/social.js";
import {
  createSocialProvider,
  groundedPosts,
  validSocialVenue,
} from "../server/social.js";

const tiktok = "https://www.tiktok.com/@garden/video/7123456789012345678";
const instagram = "https://www.instagram.com/reel/RealPost123/";
const venue = {
  name: "Royal Botanic Garden Sydney",
  address: "Mrs Macquaries Road, Sydney NSW 2000",
  lat: -33.8645,
  lng: 151.2162,
};
const response = (posts, urls = [tiktok, instagram]) => ({
  output: [
    {
      type: "web_search_call",
      action: {
        type: "search",
        sources: urls.map((url) => ({ type: "url", url })),
      },
    },
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify({ posts }) }],
    },
  ],
});

test("individual social URLs canonicalise safely and produce only official embeds", () => {
  assert.equal(socialPost(`${tiktok}?tracking=1`).url, tiktok);
  assert.equal(socialPost(instagram).platform, "Instagram");
  assert.equal(socialPost("https://www.instagram.com/garden.sydney/reel/RealPost123/?igsh=tracking").url, instagram);
  assert.equal(socialEmbed({ url: instagram }), `${instagram}embed/`);
  assert.match(
    socialEmbed({ url: tiktok }),
    /^https:\/\/www.tiktok.com\/player\/v1\/7123456789012345678\?/,
  );
  for (const url of [
    "http://www.instagram.com/p/RealPost123/",
    "https://instagram.com.evil.test/p/RealPost123/",
    "https://user@instagram.com/p/RealPost123/",
    "https://instagram.com:444/p/RealPost123/",
    "https://instagram.com/garden/",
    "https://tiktok.com/@garden",
    "https://vm.tiktok.com/123/",
    "javascript:alert(1)",
    `${tiktok}/embed`,
    "https://localhost/",
    null,
  ]) {
    assert.equal(socialPost(url), null, String(url));
  }
});

test("discovery rejects invented links, duplicates and unmatched venues", () => {
  const posts = groundedPosts(
    response([
      { url: tiktok, caption: "Sydney garden walk", matchesVenue: true },
      { url: `${tiktok}?tracking=1`, matchesVenue: true },
      { url: instagram, caption: "Melbourne garden", matchesVenue: false },
      { url: "https://www.instagram.com/p/Fabricated123/", matchesVenue: true },
      { url: "https://evil.test/video/123", matchesVenue: true },
    ]),
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, tiktok);
  assert.equal(posts[0].caption, "Sydney garden walk");
  assert.deepEqual(
    groundedPosts({
      output: [{ content: [{ type: "output_text", text: "not json" }] }],
    }),
    [],
  );
});

test("citation-only social sources are accepted, but profiles and unconfirmed matches are not", () => {
  const result = response([{ url: instagram, matchesVenue: true }], []);
  result.output[1].content[0].annotations = [
    { type: "url_citation", url: instagram },
  ];
  assert.equal(groundedPosts(result)[0].url, instagram);
  result.output[1].content[0].text = JSON.stringify({
    posts: [{ url: instagram }],
  });
  assert.deepEqual(groundedPosts(result), []);
});

test("search coalesces requests, caches, uses source grounding and only sends public venue data", async () => {
  let calls = 0,
    request;
  let time = 1000;
  const provider = createSocialProvider(
    "test-only-key",
    "gpt-4.1-mini",
    async (url, options) => {
      calls++;
      if (url.includes("api.openai.com")) {
        request = JSON.parse(options.body);
        return {
          ok: true,
          json: async () =>
            response([
              { url: tiktok, caption: "Garden Sydney", matchesVenue: true },
              { url: instagram, matchesVenue: true },
            ]),
        };
      }
      assert.match(url, /^https:\/\/www.tiktok.com\/oembed\?url=/);
      assert.equal(options.redirect, "error");
      return {
        ok: true,
        json: async () => ({
          title: "real caption",
          author_name: "garden",
          thumbnail_url: "https://images.example.test/thumb.jpg",
          html: "<script>evil()</script>",
        }),
      };
    },
    () => time,
  );
  const [first, second] = await Promise.all([
    provider.discover({ ...venue, privateName: "PRIVATE_NAME" }),
    provider.discover(venue),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 2);
  assert.equal(first[0].creator, "garden");
  assert.equal(first[0].thumbnail, "https://images.example.test/thumb.jpg");
  assert.equal(first[0].html, undefined);
  assert.equal(request.store, false);
  assert.equal(request.tool_choice, "required");
  assert.deepEqual(request.include, ["web_search_call.action.sources"]);
  assert.deepEqual(request.tools[0].filters.allowed_domains, [
    "tiktok.com",
    "instagram.com",
  ]);
  assert.equal(request.input.includes("PRIVATE_NAME"), false);
  await provider.discover(venue);
  assert.equal(calls, 2);
  time += 6 * 3600000 + 1;
  await provider.discover(venue);
  assert.equal(calls, 4);
});

test("empty search caches briefly, failure retries, and blocked metadata keeps the original link", async () => {
  let calls = 0,
    time = 1000;
  const provider = createSocialProvider(
    "test",
    undefined,
    async () => {
      calls++;
      return { ok: true, json: async () => response([]) };
    },
    () => time,
  );
  await provider.discover(venue);
  await provider.discover(venue);
  assert.equal(calls, 1);
  time += 15 * 60000 + 1;
  await provider.discover(venue);
  assert.equal(calls, 2);
  let failedCalls = 0;
  const failed = createSocialProvider("test", undefined, async () => {
    failedCalls++;
    throw new Error("Blocked");
  });
  await assert.rejects(failed.discover(venue));
  await assert.rejects(failed.discover(venue));
  assert.equal(failedCalls, 2);
  const fallback = await failed.preview(tiktok);
  assert.equal(fallback.url, tiktok);
  assert.equal(fallback.thumbnail, undefined);
  const before = failedCalls;
  await assert.rejects(failed.preview("https://127.0.0.1/private"));
  assert.equal(failedCalls, before);
  assert.equal((await failed.preview(instagram)).platform, "Instagram");
});

test("social venue input is bounded to public Sydney places", () => {
  assert.ok(validSocialVenue(venue));
  for (const input of [
    null,
    {},
    { ...venue, lat: -37.8 },
    { ...venue, lng: 145 },
    { ...venue, name: "x" },
    { ...venue, address: "a".repeat(251) },
  ])
    assert.ok(!validSocialVenue(input));
});
