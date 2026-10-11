import test from "node:test";
import assert from "node:assert/strict";
import { venuePostLinks } from "../src/data/venuePosts.ts";
import { sydneyVenues } from "../src/data/sydneyVenues.js";
import { mellowayPicks } from "../src/data/mellowayPicks.js";
import { socialPost } from "../src/utils/social.js";

const matchaya = sydneyVenues.find(venue => venue.id === "sydney-matchaya");

test("the manually attached reel follows MATCHA-YA across existing catalogue and crawl records", () => {
  const before = structuredClone(matchaya);
  const links = venuePostLinks(matchaya);
  assert.equal(links.length, 1);
  assert.equal(socialPost(links[0]).platform, "TikTok");
  const crawl = mellowayPicks[0].stops.find(venue => venue.id === "pick-matcha-matchaya");
  assert.deepEqual(venuePostLinks(crawl), links);
  assert.deepEqual(venuePostLinks({ ...crawl, id: "google-matchaya", name: "Matcha-Ya Haymarket", source: "google" }), links);
  assert.deepEqual(matchaya, before);
});

test("different branches, distant namesakes and fictional venues do not inherit the reel", () => {
  for (const venue of [
    { ...matchaya, id: "other-branch", address: "20 Steam Mill Lane, Haymarket NSW 2000" },
    { ...matchaya, id: "namesake", lat: -33.92, lng: 151.16 },
    { ...matchaya, source: "demo" },
    sydneyVenues.find(venue => venue.id !== matchaya.id),
  ]) assert.deepEqual(venuePostLinks(venue), []);
});

test("returned links cannot mutate the association used by a fresh visit", () => {
  const links = venuePostLinks(matchaya);
  const before = [...links];
  links.pop();
  assert.deepEqual(venuePostLinks(matchaya), before);
});
