import test from "node:test";
import assert from "node:assert/strict";
import { searchPlaces } from "../src/utils/placeSearch.ts";

const matchaya = {
  venue: {
    id: "cafe", name: "MATCHA-YA", address: "10 Steam Mill Lane, Haymarket NSW 2000",
    lat: -33.8778, lng: 151.2018, source: "curated", category: "Matcha cafés",
    tags: ["Desserts"], cost: null, weeklyHours: null,
  },
  href: "/venue/cafe",
};
const bakery = {
  venue: {
    id: "bakery", name: "A Bakery", address: "16 Glebe Point Road, Glebe NSW 2037",
    lat: -33.884, lng: 151.1922, source: "curated", category: "Bakery",
    vibes: ["Matcha date"], description: "Japanese-inspired bakes",
  },
  href: "/picks/places/bakery",
};

test("place search matches names, categories, vibes, addresses and descriptions", () => {
  const entries = [matchaya, bakery];
  assert.deepEqual(searchPlaces(entries, "matcha"), entries);
  for (const query of ["MaTcHa-Ya", "matchaya", "matcha cafe", "Steam Mill", "desserts Haymarket"])
    assert.deepEqual(searchPlaces(entries, query), [matchaya]);
  for (const query of ["matcha Glebe", "Japanese bakes", "16 glebe point"])
    assert.deepEqual(searchPlaces(entries, query), [bakery]);
});

test("duplicate places retain the first detail route and searchable aliases", () => {
  const alias = {
    venue: {
      ...matchaya.venue, id: "crawl-cafe", name: "Matcha-Ya Sydney",
      address: "10 Steam Mill Ln, Haymarket NSW 2000", lat: -33.8775, lng: 151.2026,
      reason: "Traditional soft serve", cost: 12,
    },
    href: "/picks/crawl/venue/crawl-cafe",
  };
  const entries = [matchaya, alias, bakery];
  const before = structuredClone(entries);
  assert.deepEqual(searchPlaces(entries, "matcha"), [matchaya, bakery]);
  assert.deepEqual(searchPlaces(entries, "soft serve"), [matchaya]);
  assert.equal(searchPlaces(entries, "soft serve")[0].href, "/venue/cafe");
  assert.deepEqual(entries, before);
  assert.equal(matchaya.venue.cost, null);
  assert.equal(matchaya.venue.weeklyHours, null);
});

test("nearby branches at different street numbers remain separate results", () => {
  const branch = {
    venue: { ...matchaya.venue, id: "other-cafe", address: "20 Steam Mill Lane, Haymarket NSW 2000" },
    href: "/venue/other-cafe",
  };
  assert.deepEqual(searchPlaces([matchaya, branch], "matcha"), [matchaya, branch]);
});

test("fictional and unsourced entries are excluded; empty and unmatched queries return no places", () => {
  const entries = [
    { venue: { ...matchaya.venue, id: "demo", source: "demo" }, href: "/venue/demo" },
    { venue: { ...matchaya.venue, id: "unknown", source: undefined }, href: "/venue/unknown" },
    matchaya,
  ];
  assert.deepEqual(searchPlaces(entries, "matcha"), [matchaya]);
  for (const query of ["", "   ", "!—?", "unlisted-place"])
    assert.deepEqual(searchPlaces(entries, query), []);
});
