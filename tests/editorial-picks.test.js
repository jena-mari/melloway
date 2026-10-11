import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { editorialPicks } from "../src/data/editorialPicks.js";
import { sydneyVenues } from "../src/data/sydneyVenues.js";
import { mellowayPicks } from "../src/data/mellowayPicks.js";

const byId = (id) => editorialPicks.find((venue) => venue.id === id);

test("editorial collections have ten unique places, with Glebe shared by ID", () => {
  assert.equal(editorialPicks.length, 10);
  assert.equal(new Set(editorialPicks.map((venue) => venue.id)).size, 10);
  assert.ok(editorialPicks.every((venue) => venue.collections.includes("melloway")));
  const shana = editorialPicks.filter((venue) => venue.collections.includes("shana"));
  assert.deepEqual(shana.map((venue) => venue.id), ["sydney-glebe-markets"]);
  assert.equal(sydneyVenues.filter((venue) => venue.id === shana[0].id).length, 1);
  assert.equal(shana[0].mins, 75);
  assert.equal(sydneyVenues.find((venue) => venue.id === shana[0].id).mins, 60);
});

test("browse overlays preserve the Matcha Crawl and the planner catalog", () => {
  const old = mellowayPicks[0].stops.find((venue) => venue.id === "pick-matcha-chubby-westfield");
  const browse = byId(old.id);
  assert.equal(browse.cost, 18);
  assert.equal(browse.mins, 40);
  assert.equal(old.cost, 12);
  assert.equal(old.mins, 45);
  assert.equal(mellowayPicks[0].stops.length, 5);
  assert.equal(sydneyVenues.length, 36);
  assert.equal(editorialPicks.filter((venue) => sydneyVenues.some((item) => item.id === venue.id)).length, 1);
  assert.match(browse.address, /Level 1.*Westfield Sydney/);
  assert.match(byId("pick-mamuki-glebe").address, /16 Glebe Point Road/);
});

test("all pick pins have Sydney coordinates and traceable editorial and map sources", () => {
  for (const venue of editorialPicks) {
    assert.ok(venue.lat > -34 && venue.lat < -33.8, venue.name);
    assert.ok(venue.lng > 151.1 && venue.lng < 151.3, venue.name);
    assert.ok(venue.mins > 0 && venue.costLabel);
    assert.ok(venue.cost === null || (Number.isFinite(venue.cost) && venue.cost >= 0));
    assert.equal(venue.coordinatesStatus, "approximate");
    assert.ok(venue.sources.length && venue.sources.every((source) => source.url.startsWith("https://")));
    assert.ok(venue.coordinateSource.startsWith("https://"));
    assert.equal(venue.rating, undefined);
    assert.equal(venue.reviews, undefined);
    assert.equal(venue.tiktokUrl, undefined);
  }
  assert.equal(byId("pick-o3-newtown").coordinateSource, "https://maps.app.goo.gl/HER2m5WwpVB5uzf66");
});

test("time-specific picks retain event, overnight and membership conditions", () => {
  const birdcage = byId("pick-birdcage-bank-hotel");
  assert.equal(birdcage.kind, "recurring-event");
  assert.deepEqual(birdcage.eventSchedule, { weekday: 3, start: "21:00", end: null });
  assert.equal(birdcage.weeklyHours, null);
  assert.equal(birdcage.cost, null);
  const glebe = byId("sydney-glebe-markets");
  assert.deepEqual(glebe.weeklyHours.slice(0, 6), Array.from({ length: 6 }, () => []));
  assert.deepEqual(glebe.weeklyHours[6], [{ open: 600, close: 960 }]);
  const club = byId("pick-caterpillar-club");
  assert.equal(club.weeklyHours[0][0].close, 1620);
  assert.equal(club.weeklyHours[4][0].close, 1680);
  assert.match(byId("pick-o3-newtown").conditions, /free membership has limited weekly access/);
  assert.equal(byId("pick-o3-newtown").cost, null);
  assert.equal(byId("pick-old-school-kafey").weeklyHours, null);
  assert.match(byId("pick-joji-sydney").conditions, /age-policy/);
});

test("photos have explicit reuse licenses and missing photos have no unrelated substitutes", () => {
  const photos = editorialPicks.filter((venue) => venue.image);
  assert.equal(photos.length, 2);
  for (const venue of photos) {
    assert.match(venue.image, /^\/images\/picks\/(glebe-markets|observatory-hill)\.webp$/);
    const asset = readFileSync(new URL(`../public${venue.image}`, import.meta.url));
    assert.equal(asset.subarray(0, 4).toString(), "RIFF");
    assert.equal(asset.subarray(8, 12).toString(), "WEBP");
    assert.equal(venue.photo.license, "CC BY-SA 4.0");
    assert.ok(venue.photo.sourceUrl.startsWith("https://commons.wikimedia.org/wiki/File:"));
    assert.match(venue.photo.caption, /resized\/WebP; display crop/);
    assert.ok(venue.photo.author && venue.photo.license && venue.photo.sourceUrl && venue.photo.licenseUrl);
    assert.match(venue.photo.caption, /archive/);
  }
  for (const venue of editorialPicks.filter((venue) => !venue.image)) {
    assert.ok(venue.artwork);
    assert.equal(venue.photo, undefined);
  }
});
