import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAIProvider,
  recommendationInput,
  validRecommendationVenues,
} from "../server/openai.js";
import { applyRecommendations } from "../src/utils/recommendations.js";
import { defaultDraft } from "../src/data/preferences.js";
import { venues } from "../src/data/venues.js";
import { selectVenues, demoMatrix, optimise } from "../src/utils/planner.js";
import { interpretPreferences } from "../src/engine/preferences.js";

const prefs = {
  ...defaultDraft(),
  name: "PRIVATE_NAME",
  partner: "PRIVATE_PARTNER",
  age: 25,
  gender: "PRIVATE_GENDER",
  notes: "matcha and books, no coffee",
};
const candidates = selectVenues(venues, prefs);
const rankings = candidates.map((v) => ({
  venueId: v.id,
  fit: 8,
  exclude: false,
}));
const output = (value, overrides = {}) => ({
  ok: true,
  json: async () => ({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify({ rankings: value }) },
        ],
      },
    ],
    ...overrides,
  }),
});

test("OpenAI uses a server-only structured request with minimal planning data", async () => {
  let request;
  const provider = createOpenAIProvider(
    "TEST_SECRET",
    "gpt-4.1-mini",
    async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init.headers.Authorization, "Bearer TEST_SECRET");
      request = JSON.parse(init.body);
      return output(rankings);
    },
  );
  assert.deepEqual(await provider.rank(prefs, candidates), rankings);
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 1600);
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(
    request.text.format.schema.properties.rankings.items.properties.venueId
      .enum,
    candidates.map((v) => v.id),
  );
  assert.equal(JSON.parse(request.input).preferences.notes, prefs.notes);
  assert.doesNotMatch(
    request.input,
    /PRIVATE_NAME|PRIVATE_PARTNER|PRIVATE_GENDER|TEST_SECRET|"lat"|"lng"|"image"/,
  );
  assert.equal(
    recommendationInput(prefs, candidates).places.length,
    candidates.length,
  );
  await provider.rank(
    {
      ...prefs,
      intent: {
        ...interpretPreferences(prefs),
        privateExtra: "PRIVATE_PARTNER",
      },
    },
    candidates,
  );
  assert.doesNotMatch(request.input, /PRIVATE_PARTNER|privateExtra/);
});

test("OpenAI semantic interpretation is structured and omits profile data", async () => {
  const intent = interpretPreferences({
    ...prefs,
    notes: "romantic speakeasy and fancy dinner",
  });
  let request;
  const provider = createOpenAIProvider(
    "TEST",
    undefined,
    async (url, init) => {
      request = JSON.parse(init.body);
      return output([], {
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(intent) }],
          },
        ],
      });
    },
  );
  assert.deepEqual(await provider.interpret(prefs), intent);
  assert.equal(request.text.format.name, "outing_intent");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.max_output_tokens, 700);
  assert.equal(request.store, false);
  assert.doesNotMatch(
    request.input,
    /PRIVATE_NAME|PRIVATE_PARTNER|PRIVATE_GENDER|TEST_SECRET/,
  );
  assert.equal(JSON.parse(request.input).notes, prefs.notes);
  await provider.interpret({
    ...prefs,
    selectedPreferences: [],
    preferences: ["Flea markets", "Matcha cafés"],
  });
  assert.deepEqual(JSON.parse(request.input).requestedInterests, []);
  for (const bad of [
    { ...intent, requiredRoles: ["invented"] },
    { ...intent, period: "whenever" },
    { ...intent, upscaleMeal: "yes" },
  ]) {
    await assert.rejects(
      createOpenAIProvider("TEST", undefined, async () =>
        output([], {
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(bad) }],
            },
          ],
        }),
      ).interpret(prefs),
    );
  }
  await assert.rejects(
    createOpenAIProvider("TEST", undefined, async () =>
      output([], { status: "incomplete" }),
    ).interpret(prefs),
  );
});

test("rejected, incomplete, malformed, duplicate and fabricated output is never accepted", async () => {
  const bad = [
    rankings.slice(1),
    [{ ...rankings[0], venueId: "invented-place" }, ...rankings.slice(1)],
    [{ ...rankings[0], fit: 99 }, ...rankings.slice(1)],
    [{ ...rankings[0], exclude: "yes" }, ...rankings.slice(1)],
    [rankings[1], ...rankings.slice(1)],
  ];
  for (const value of bad) {
    await assert.rejects(
      createOpenAIProvider("TEST", undefined, async () => output(value)).rank(
        prefs,
        candidates,
      ),
    );
    assert.throws(() => applyRecommendations(candidates, value));
  }
  for (const response of [
    { ok: false },
    output(rankings, { status: "incomplete" }),
    output(rankings, {
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "no" }] },
      ],
    }),
    output(rankings, { output: [] }),
  ])
    await assert.rejects(
      createOpenAIProvider("TEST", undefined, async () => response).rank(
        prefs,
        candidates,
      ),
    );
  await assert.rejects(
    createOpenAIProvider("TEST", undefined, async () => {
      throw new Error("timeout");
    }).rank(prefs, candidates),
  );
  let called = false;
  await assert.rejects(
    createOpenAIProvider("", undefined, async () => {
      called = true;
    }).rank(prefs, candidates),
  );
  assert.equal(called, false);
});

test("AI rankings preserve venue facts and hard planning constraints", () => {
  const ranked = applyRecommendations(candidates, rankings);
  for (let i = 0; i < ranked.length; i++) {
    const { score, ...actual } = ranked[i];
    const { score: oldScore, ...original } = candidates[i];
    assert.equal(score, 24);
    assert.deepEqual(actual, original);
  }
  const plan = optimise(ranked, prefs, demoMatrix(ranked, prefs.transport));
  assert.ok(plan);
  assert.ok(plan.cost <= prefs.budget);
  assert.ok(plan.elapsed <= prefs.duration * 60);
  assert.ok(plan.stops.every((v) => candidates.some((c) => c.id === v.id)));
  const excluded = rankings.map((r, i) => ({ ...r, exclude: i === 0 }));
  assert.ok(
    !applyRecommendations(candidates, excluded).some(
      (v) => v.id === candidates[0].id,
    ),
  );
  assert.ok(
    applyRecommendations(candidates, excluded, [candidates[0].id]).some(
      (v) => v.id === candidates[0].id,
    ),
  );
  assert.equal(
    applyRecommendations(
      candidates,
      rankings.map((r) => ({ ...r, exclude: true })),
    ).length,
    0,
  );
});

test("recommendation input is bounded and cannot include duplicate IDs or invalid costs", () => {
  assert.equal(validRecommendationVenues(candidates), true);
  for (const value of [
    [],
    Array(15).fill(candidates[0]),
    [candidates[0], candidates[0]],
    [{ ...candidates[0], cost: -1 }],
    [{ ...candidates[0], mins: Infinity }],
    [{ ...candidates[0], name: "x".repeat(201) }],
  ])
    assert.equal(validRecommendationVenues(value), false);
});
