import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleProvider,
  openingHours,
  discoveryQueries,
} from "../server/google.js";
import { defaultDraft } from "../src/data/preferences.js";
import { outingInstant } from "../src/utils/date.js";

test("Sydney departure timestamps account for seasonal daylight saving", () => {
  assert.equal(
    outingInstant("2026-01-10", "11:00"),
    "2026-01-10T00:00:00.000Z",
  );
  assert.equal(
    outingInstant("2026-06-10", "11:00"),
    "2026-06-10T01:00:00.000Z",
  );
  assert.throws(() => outingInstant("2026-02-30", "11:00"));
});
test("Google opening periods preserve overnight and always-open hours", () => {
  const days = openingHours([
    { open: { day: 6, hour: 22 }, close: { day: 0, hour: 2 } },
  ]);
  assert.deepEqual(days[6], [{ open: 1320, close: 1560 }]);
  assert.deepEqual(days[0], [{ open: 0, close: 120 }]);
  assert.ok(
    openingHours([{ open: { day: 0, hour: 0 } }]).every(
      (d) => d[0].close === 1440,
    ),
  );
  assert.ok(
    openingHours([{ open: { day: 3, hour: 9 } }]).every((d) => !d.length),
  );
});
test("discovery gives food and activities room alongside hangout preferences", () => {
  const queries = discoveryQueries([
    "Coffee shops",
    "Matcha cafés",
    "Bookshops",
    "Thrifting",
    "Italian food",
    "Museums",
  ]);
  assert.ok(queries.includes("Italian food"));
  assert.ok(queries.includes("Museums"));
  assert.equal(queries.length, 4);
});
test("transit matrices batch within 100 elements, remap indices and keep failed edges unavailable", async () => {
  const requests = [];
  const fetcher = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.ok(body.origins.length * body.destinations.length <= 100);
    return Response.json(
      body.origins.flatMap((o, i) =>
        body.destinations.map((d, j) => ({
          originIndex: i,
          destinationIndex: j,
          condition: j === 1 ? "ROUTE_NOT_FOUND" : "ROUTE_EXISTS",
          duration: "120s",
          distanceMeters: 1000,
        })),
      ),
    );
  };
  const venues = Array.from({ length: 14 }, (_, i) => ({
    lat: -33.88 + i * 0.001,
    lng: 151.2,
  }));
  const matrix = await createGoogleProvider("test-key", fetcher).routeMatrix(
    venues,
    {
      ...defaultDraft(),
      date: "2026-10-10",
      time: "11:00",
      transport: "Public transport",
    },
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].departureTime, "2026-10-10T00:00:00.000Z");
  assert.equal(matrix[13][12].minutes, 2);
  assert.equal(matrix[13][1].minutes, null);
  assert.equal(JSON.parse(JSON.stringify(matrix))[13][1].minutes, null);
});

test("departure timestamps respect the clock change itself", () => {
  assert.equal(
    outingInstant("2026-10-04", "01:30"),
    "2026-10-03T15:30:00.000Z",
  );
  assert.equal(
    outingInstant("2026-10-04", "03:30"),
    "2026-10-03T16:30:00.000Z",
  );
  assert.throws(() => outingInstant("2026-10-04", "02:30"));
});
