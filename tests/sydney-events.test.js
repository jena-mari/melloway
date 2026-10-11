import test from "node:test";
import assert from "node:assert/strict";
import { upcomingSydneyEvents } from "../src/data/sydneyEvents.js";

test("Sydney highlights include an event through its last day and expire after it", () => {
  assert.equal(upcomingSydneyEvents("2026-10-11").length, 3);
  assert.equal(upcomingSydneyEvents("2026-10-18").some(e => e.id === "sydney:surplus-2026"), true);
  assert.deepEqual(upcomingSydneyEvents("2026-10-25").map(e => e.id), ["sydney:sculpture-bondi-2026"]);
  assert.deepEqual(upcomingSydneyEvents("2026-11-03"), []);
});
