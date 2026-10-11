import test from "node:test";
import assert from "node:assert/strict";
import { socialSearchResponse } from "../server/socialSearch.js";

const body = { model: "gpt-4.1-mini", store: false, tool_choice: "required",
  tools: [{ type: "web_search", filters: { allowed_domains: ["instagram.com"] }, search_context_size: "medium" }],
  include: ["web_search_call.action.sources"], input: "Sydney events" };

test("explicit unsupported filters retry once while preserving the model, grounding and search requirement", async () => {
  const requests = [];
  const response = await socialSearchResponse("mock-only", body, async (_, options) => {
    requests.push(JSON.parse(options.body));
    return requests.length === 1
      ? Response.json({ error: { message: "filters are not supported with this model", param: "tools[0].filters" } }, { status: 400 })
      : Response.json({ output: [] });
  });
  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], body);
  assert.deepEqual(requests[1], { ...body, tools: [{ type: "web_search", search_context_size: "medium" }] });
  assert.ok(body.tools[0].filters); // No mutation of the provider's template.
});

test("authentication, rate limits, malformed failures and unrelated configuration errors never retry", async () => {
  for (const [status, error] of [[401, { message: "filters unsupported" }], [429, {}], [400, { message: "Invalid model", param: "model" }], [400, { message: "Invalid filters", param: "tools[0].filters" }]]) {
    let calls = 0;
    const response = await socialSearchResponse("mock-only", body, async () => { calls++; return Response.json({ error }, { status }); });
    assert.equal(response.status, status); assert.equal(calls, 1);
  }
  let calls = 0;
  await socialSearchResponse("mock-only", body, async () => { calls++; return new Response("not json", { status: 400 }); });
  assert.equal(calls, 1);
});
