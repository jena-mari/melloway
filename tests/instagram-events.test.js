import test from "node:test";
import assert from "node:assert/strict";
import { groundedInstagramEvents, createInstagramEventsProvider, InstagramDiscoveryError } from "../server/instagramEvents.js";
import { instagramEvents } from "../src/utils/instagramEvents.js";

const url = "https://www.instagram.com/p/MockMarket123/";
const event = { url, title: "Mock Sydney Market", host: "Mock Makers", handle: "mockmakers", type: "markets",
  area: "Mock Hall, Newtown", startDate: "2026-10-17", endDate: "2026-10-18", text: "Local makers and food.", matchesSydney: true, datesConfirmed: true };
function response(posts, urls = [url]) {
  return { output: [{ type: "web_search_call", action: { sources: urls.map(url => ({ url })) } },
    { content: [{ type: "output_text", text: JSON.stringify({ posts }) }] }] };
}
const ground = value => groundedInstagramEvents(value, "2026-10-11", "2026-12-10");

test("Instagram events reject fabricated URLs, stale dates, other cities, ambiguous dates and search pages", () => {
  const posts = ground(response([
    event, { ...event, url: `${url}?tracking=1` },
    { ...event, url: "https://www.instagram.com/p/InventedPost/" },
    { ...event, matchesSydney: false }, { ...event, datesConfirmed: false },
    { ...event, startDate: "2025-10-17", endDate: "2025-10-18" },
    { ...event, startDate: "2027-02-01", endDate: "2027-02-02" },
    { ...event, startDate: "2026-02-30", endDate: "2026-02-30" },
    { ...event, startDate: "2026-10-17", endDate: "2026-10-15" },
    { ...event, url: "https://www.instagram.com/explore/search/keyword/?q=sydney" },
  ]));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "instagram:MockMarket123");
  assert.equal(posts[0].when, "17 Oct 2026 – 18 Oct 2026");
  assert.equal(posts[0].matchesSydney, undefined);
  assert.equal(posts[0].minimumPriceAUD, undefined);
  assert.deepEqual(ground(response(null)), []);
  assert.deepEqual(ground({ output: [{ content: [{ type: "output_text", text: "broken" }] }] }), []);
});

test("citation-only Instagram sources work and a current exhibition survives while expired events do not", () => {
  const result = response([{ ...event, startDate: "2026-09-01" }], []);
  result.output[1].content[0].annotations = [{ url: 'https://www.instagram.com/mockmakers/p/MockMarket123/' }];
  assert.equal(ground(result).length, 1);
  assert.deepEqual(ground(response([event], ["https://www.instagram.com/mockmakers/"])), []);
  const unsafe = [ { ...event, url: "https://instagram.com.evil.test/p/MockMarket123/" },
    { ...event, url: "javascript:alert(1)" }, { ...event, url: "https://www.tiktok.com/@mock/video/7123456789012345678" } ];
  assert.deepEqual(instagramEvents(unsafe), []);
});

test("Instagram discovery shares requests, caches by Sydney day, and sends no profile or scheduling inputs", async () => {
  let time = Date.parse("2026-10-10T13:30:00Z"), calls = 0, request;
  const provider = createInstagramEventsProvider("mock-only-key", "gpt-4.1-mini", async (path, options) => {
    calls++;
    assert.equal(path, "https://api.openai.com/v1/responses");
    request = JSON.parse(options.body);
    return { ok: true, json: async () => response([event]) };
  }, () => time);
  const [a, b] = await Promise.all([provider.discover(), provider.discover()]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(request.input), { city: "Sydney, NSW, Australia", today: "2026-10-11", until: "2026-12-10" });
  assert.equal(request.model, "gpt-4.1-mini"); assert.equal(request.store, false);
  assert.deepEqual(request.tools[0].filters.allowed_domains, ["instagram.com"]);
  assert.deepEqual(request.include, ["web_search_call.action.sources"]);
  await provider.discover(); assert.equal(calls, 1);
  time += 6 * 3600000 + 1; await provider.discover(); assert.equal(calls, 2);
  time = Date.parse("2026-10-11T13:00:00Z"); await provider.discover(); assert.equal(calls, 3);
});

test("empty results cache briefly and provider failures retry without invented fallback events", async () => {
  let calls = 0, time = Date.parse("2026-10-11T00:00:00Z");
  const provider = createInstagramEventsProvider("mock", undefined, async () => {
    calls++; return { ok: true, json: async () => response([]) };
  }, () => time);
  await provider.discover(); await provider.discover(); assert.equal(calls, 1);
  time += 15 * 60000 + 1; await provider.discover(); assert.equal(calls, 2);
  const failed = createInstagramEventsProvider("mock", undefined, async () => { calls++; return { ok: false, status: 503, json: async () => ({}) }; });
  await assert.rejects(failed.discover(), /unavailable/);
  await assert.rejects(failed.discover(), /unavailable/); assert.equal(calls, 4);
  await assert.rejects(createInstagramEventsProvider("", undefined, async () => assert.fail("No credential request")).discover());
});

test("provider diagnostics classify failures without exposing returned errors or credentials", async () => {
  for (const [status, code] of [[401, "authentication"], [403, "authentication"], [429, "rate_limit"], [400, "configuration"], [404, "configuration"], [500, "provider_unavailable"]]) {
    const provider = createInstagramEventsProvider("PRIVATE_MOCK_KEY", undefined, async () => ({
      ok: false, status, json: async () => ({ error: { message: "PRIVATE_PROVIDER_ERROR" } }),
    }));
    await assert.rejects(provider.discover(), error => {
      assert.ok(error instanceof InstagramDiscoveryError);
      assert.equal(error.code, code);
      assert.equal(error.message, "Instagram discovery unavailable");
      return true;
    });
  }
});
