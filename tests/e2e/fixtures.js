import { localLocations } from "../../src/utils/location.js";
import { googleMapsFixture } from "./google-maps-fixture.js";
import { renderVenueMap } from "../../server/eventMap.ts";
import { itineraryMapPoints } from "../../server/itineraryMap.ts";
// Keep the shared fixture entry point while moving maps to the offline Google SDK.
export async function mockMapTiles(page) {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ status: 503, json: { error: 'Offline test fixture' } }));
  // Never reach configured paid providers, including research added to Explore.
  await page.route("**/api/status", route => route.fulfill({ json: { venues: "curated", recommendations: "planner", socialDiscovery: "unavailable" } }));
  await page.route("**/api/discovery", route => route.fulfill({ json: { leads: [], venues: [], researchStatus: "sources" } }));
  for (const endpoint of ["venues", "matrix", "intent", "recommendations", "social/search", "social/preview"])
    await page.route(`**/api/${endpoint}`, route => route.fulfill({ status: 503, json: { error: "Offline test fixture" } }));
  await page.route("**/api/events?**", route => route.fulfill({ status: 503, json: { error: "Offline test fixture" } }));
  for (const host of ["surplus.sydney", "atparramatta.com", "sculpturebythesea.com"]) {
    await page.route(`https://${host}/**`, route => route.fulfill({ contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#d9dfcb"/><text x="24" y="240" font-size="28">Mock organiser artwork</text></svg>' }));
  }
  await page.route("**/api/social/events", route => route.fulfill({ json: { posts: [] } }));
  await page.route("**/api/maps/config", route => route.fulfill({
    json: { apiKey: "offline-browser-map-key", mapId: "DEMO_MAP_ID" },
  }));
  await page.route("https://maps.googleapis.com/maps/api/js**", route => route.fulfill({
    contentType: "application/javascript", body: googleMapsFixture,
  }));
  await page.route("**/api/itinerary-map?*", route => {
    const query = new URL(route.request().url()).searchParams.get("stops");
    const points = itineraryMapPoints(JSON.parse(query));
    return route.fulfill({ contentType: "text/html", body: renderVenueMap(points, "offline-browser-map-key", "itinerary") });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f6f5f2"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" fill="none" stroke="white" stroke-width="8"/><text x="100" y="128" fill="#aaa" font-size="10">test tile</text></svg>',
    }),
  );
}

export async function continueQuestions(page, count = 1) {
  for (let i = 0; i < count; i++) {
    const previousUrl = page.url();
    await page.getByRole("button", { name: "continue", exact: true }).click();
    await page.waitForURL(url => url.href !== previousUrl);
  }
}

export async function chooseTime(page, value) {
  const [hour, minute] = value.split(":").map(Number);
  await page
    .getByLabel("hour", { exact: true })
    .selectOption(String(hour % 12 || 12));
  await page.getByLabel("minute", { exact: true }).selectOption(String(minute));
  await page
    .getByLabel("am or pm", { exact: true })
    .selectOption(hour >= 12 ? "pm" : "am");
}

export async function mockLocationSearch(page) {
  await page.route("**/api/locations/search", (route) =>
    route.fulfill({
      json: {
        source: "local",
        suggestions: localLocations(route.request().postDataJSON().query),
      },
    }),
  );
}
export async function chooseArea(page, area) {
  await page.getByLabel("any specific location in mind?").fill(area);
  await page
    .locator("#sydney-location-results")
    .getByRole("option")
    .filter({ hasText: area })
    .first()
    .click();
}
