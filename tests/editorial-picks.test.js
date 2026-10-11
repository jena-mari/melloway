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

test("all ten picks use the supplied image links and traceable source credits", () => {
  const expected = {
    "pick-matcha-chubby-westfield": "https://img3.restaurantguru.com/c68c-Chubby-Cubby-Cafe-Sydney-tiramisu.jpg",
    "pick-ace-sydney-photobooth": "https://cdn.sanity.io/images/74hnwp2p/production/753fc0ffc02e5edc68e9bf96e10741ad6cb80e75-2364x1773.jpg?auto=format&w=2200",
    "sydney-glebe-markets": "https://commons.wikimedia.org/wiki/Special:FilePath/Part_of_Glebe_Markets_April_2026.jpg?width=1280",
    "pick-birdcage-bank-hotel": "https://images-r2-1.thebrag.com/tmn/uploads/image-1200x630-57-1.jpg",
    "pick-caterpillar-club": "https://static.martin-audio.com/pressrelease/medium/martin-audio-cdd-brings-out-the-detail-at-vinyl-led-caterpillar-club-5.jpg",
    "pick-joji-sydney": "https://media.timeout.com/images/106196307/1024/576/image.jpg",
    "pick-o3-newtown": "https://framerusercontent.com/images/5qYpdbbCYzzgkI7Zlz3Tccpntyc.jpeg?height=4284&scale-down-to=2048&width=5712",
    "pick-old-school-kafey": "https://images.notquitenigella.com/images/old-school-kafey-sydney/ll.jpg",
    "pick-observatory-hill-park": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Observatory_Hill_Sydney.jpg/1280px-Observatory_Hill_Sydney.jpg",
    "pick-mamuki-glebe": "https://cdn.broadsheet.com.au/images/2026/03/12/Mamuki_Yusuke_Oba_Feb_2026_Low_2-c5b1fc0e15.webp"
};
  assert.equal(editorialPicks.filter(venue => venue.image).length, 10);
  for (const venue of editorialPicks) {
    assert.equal(venue.image, expected[venue.id], venue.name);
    assert.equal(new URL(venue.image).protocol, "https:");
    assert.ok(venue.photo.author && venue.photo.sourceUrl && venue.photo.licenseUrl);
    assert.equal(new URL(venue.photo.sourceUrl).protocol, "https:");
    assert.match(venue.photo.caption, /display crop/);
    assert.ok(venue.artwork); // Existing error fallback is still available.
  }
});

test("photo credits preserve license status, archive dates and contextual uncertainty", () => {
  const licensed = editorialPicks.filter(venue => venue.photo.license === "CC BY-SA 4.0");
  assert.deepEqual(licensed.map(venue => venue.id), ["sydney-glebe-markets", "pick-observatory-hill-park"]);
  for (const venue of licensed) {
    assert.equal(venue.photo.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0/");
    assert.ok(venue.photo.sourceUrl.startsWith("https://commons.wikimedia.org/wiki/File:"));
    assert.match(venue.photo.caption, /archive/);
  }
  for (const venue of editorialPicks.filter(venue => !licensed.includes(venue))) {
    assert.equal(venue.photo.license, "Reuse unverified");
    assert.equal(venue.photo.licenseUrl, venue.photo.sourceUrl);
  }
  assert.match(byId("pick-ace-sydney-photobooth").photo.caption, /lobby.*photobooth not shown/);
  assert.match(byId("pick-birdcage-bank-hotel").photo.caption, /Waywards Ballroom.*Birdcage night unverified/);
  assert.match(byId("pick-o3-newtown").photo.caption, /branch pictured unverified/);
  assert.match(byId("pick-old-school-kafey").photo.caption, /2019/);
});
