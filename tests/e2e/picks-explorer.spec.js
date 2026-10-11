import { test, expect } from "@playwright/test";
import { mediaVenueKey } from '../../packages/domain/src/venueMedia.ts';
import { editorialPicks } from "../../src/data/editorialPicks.js";
import { curatedVenuesForDate } from "../../src/data/sydneyVenues.js";
import { defaultDraft } from "../../src/data/preferences.js";
import { demoMatrix, schedule } from "../../src/utils/planner.js";
import { googleMapsFixture } from "./google-maps-fixture.js";
import { mockMapTiles } from "./fixtures.js";
import { communityExamples } from "../../src/data/community.js";

async function mockPicks(page, { maps = true, images = true } = {}) {
  await page.route("https://**", (route) => route.abort());
  await mockMapTiles(page);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/maps/config" && maps) return route.fulfill({ json: { apiKey: "offline-fixture", mapId: "offline-fixture" } });
    return route.fulfill({ status: 503, json: { error: "Providers disabled in picks fixture" } });
  });
  await page.route("https://maps.googleapis.com/maps/api/js?**", (route) => route.fulfill({ contentType: "text/javascript", body: googleMapsFixture }));
  // Every supplied image URL is intercepted: no third-party/paid calls in tests.
  for (const venue of editorialPicks) await page.route(url => url.href === venue.image, route => images
    ? route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><rect width="1280" height="960" fill="#cbd8bc"/><text x="160" y="300" font-size="28">Supplied photo test fixture</text></svg>' })
    : route.abort());
}

test("Glebe Markets uses its school location in Picks, venue details and itinerary routing", async ({ page }) => {
  const id = "sydney-glebe-markets";
  const coordinates = { lat: -33.88346, lng: 151.19116 };
  const address = "Glebe Public School, 46–56 Glebe Point Road, Glebe NSW 2037";
  const query = "-33.88346,151.19116";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockPicks(page);
  await page.goto("/picks");
  const surface = page.locator(".picks-map .google-map-surface");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  expect(JSON.parse(await surface.getAttribute("data-fitted-points"))).toContainEqual(coordinates);
  const pin = page.getByRole("button", { name: "select Glebe Markets on map", exact: true });
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("data-center-lat", String(coordinates.lat));
  await expect(surface).toHaveAttribute("data-center-lng", String(coordinates.lng));
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/explore?place=${id}`);
  await page.getByRole("button", { name: "view Glebe Markets details", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Glebe Markets", exact: true });
  await expect(details).toContainText(address);
  expect(new URL(await details.getByRole("link", { name: "check it on Google Maps" }).getAttribute("href")).searchParams.get("query")).toBe(query);
  await page.keyboard.press("Escape");

  for (const path of [`/picks/places/${id}`, `/venue/${id}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Glebe Markets", exact: true })).toBeVisible();
    await expect(page.locator(".venue")).toContainText(address);
    expect(new URL(await page.getByRole("link", { name: "check it on Google Maps" }).getAttribute("href")).searchParams.get("query")).toBe(query);
  }

  const prefs = { ...defaultDraft(), date: "2026-10-17", time: "11:00", transport: "Walking", budget: 100, duration: 5 };
  const catalog = curatedVenuesForDate(prefs.date);
  const stops = [id, "sydney-kinokuniya"].map(id => ({ ...catalog.find(venue => venue.id === id), score: 10 }));
  const matrix = demoMatrix(stops, prefs.transport);
  const plan = { ...schedule(stops, prefs, matrix, [0, 1]), prefs, id: "glebe-location-fixture" };
  expect(plan.stops).toHaveLength(2);
  await page.evaluate(value => localStorage.setItem("melloway.current", JSON.stringify(value)), { plan, candidates: stops, matrix });
  const routeRequests = [];
  await page.route("**/api/itinerary-routes", route => {
    const body = route.request().postDataJSON();
    routeRequests.push(body);
    return route.fulfill({ json: { transport: body.transport, missingLegs: 0, warnings: [],
      paths: [{ fromIndex: 0, toIndex: 1, path: body.stops.map(({ lat, lng }) => ({ lat, lng })) }] } });
  });
  await page.goto("/itinerary");
  await expect(page.locator(".route-map-hero .google-map-surface")).toHaveAttribute("data-route-legs", "1");
  expect(routeRequests.length).toBeGreaterThan(0);
  for (const body of routeRequests) {
    expect(body.stops[0]).toMatchObject({ name: "Glebe Markets", ...coordinates });
    expect(body.stops[1]).toMatchObject({ lat: stops[1].lat, lng: stops[1].lng });
  }
  expect(JSON.parse(await page.locator(".route-map-hero .google-map-surface").getAttribute("data-fitted-points"))).toContainEqual(coordinates);
  await expect(page.locator(".route-summary-spot").first()).toContainText(address);
  const directions = new URL(await page.getByRole("link", { name: "open Google Maps", exact: true }).getAttribute("href"));
  expect(directions.searchParams.get("origin")).toBe(query);
  expect(directions.searchParams.get("destination")).toBe(`${stops[1].lat},${stops[1].lng}`);
});

test("Explore applies local map styling without losing pins or changing the onboarding map", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockPicks(page);
  await page.goto("/explore");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const options = JSON.parse(await page.locator(".picks-map .google-map-surface").getAttribute("data-map-options"));
  expect(options.mapId).toBeUndefined(); // Google ignores local styles on maps with an ID.
  expect(options.renderingType).toBe("RASTER");
  expect(options.styles).toEqual(expect.arrayContaining([
    expect.objectContaining({ featureType: "all", elementType: "labels.icon", stylers: [{ visibility: "off" }] }),
    expect.objectContaining({ featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] }),
    expect.objectContaining({ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }),
    expect.objectContaining({ featureType: "transit", stylers: [{ visibility: "off" }] }),
    expect.objectContaining({ featureType: "road.highway", elementType: "labels", stylers: [{ visibility: "off" }] }),
  ]));
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  const pin = page.getByRole("button", { name: `select ${editorialPicks[0].name} on map`, exact: true });
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(pin).toBeFocused();
  const details = page.getByRole("button", { name: `view ${editorialPicks[0].name} details`, exact: true });
  await details.click();
  await expect(page.getByRole("dialog", { name: editorialPicks[0].name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
  await page.goto("/plan/details?q=2");
  await expect(page.locator(".location-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const areaOptions = JSON.parse(await page.locator(".location-map .google-map-surface").getAttribute("data-map-options"));
  expect(areaOptions.styles).toBeUndefined();
  expect(areaOptions.mapId).toBe("offline-fixture");
  await expect(page.locator(".location-area-pin")).toHaveCount(4);
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(0);
});

test("Explore keeps ten vertical picks, pin selection and details without changing the plan", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockPicks(page);
  const requests = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  await page.addInitScript(plan => {
    if (!localStorage.getItem("melloway.current"))
      localStorage.setItem("melloway.current", JSON.stringify({ plan, candidates: [], matrix: [] }));
  }, communityExamples()[1].plan);
  await page.goto("/explore?keep=1");
  const state = () => page.evaluate(() => Object.fromEntries(
    ["melloway.current", "melloway.draft", "melloway.saved"].map(key => [key, localStorage.getItem(key)])
  ));
  const before = await state();
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const showAll = page.getByRole("button", { name: "show all pick pins" });
  await expect(showAll).toBeVisible();
  await expect(showAll).toHaveText("");
  await expect(showAll.locator("svg")).toHaveCount(1);
  const mapSurface = page.locator(".picks-map .google-map-surface");
  const overviewZoom = await mapSurface.getAttribute("data-map-zoom");
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "show suggestions", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Nearby spot suggestions" })).toHaveCount(0);
  expect(requests).toEqual([]);
  const trigger = page.getByRole("button", { name: `view ${editorialPicks[1].name} details`, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: editorialPicks[1].name, exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(editorialPicks[1].costLabel);
  await expect(sheet.getByRole("link", { name: "venue source", exact: true })).toHaveAttribute("href", editorialPicks[1].sources[0].url);
  await expect(sheet.getByRole("link", { name: "check it on Google Maps" })).toHaveAttribute("href", /-33.878801,151.2099833/);
  expect(new URL(page.url()).pathname).toBe("/explore");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("1");
  await expect(mapSurface).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
  await expect(mapSurface).toHaveAttribute("data-map-zoom", "16");
  expect(await mapSurface.getAttribute("data-camera-moves")).toBeNull();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await showAll.click();
  await expect(mapSurface).toHaveAttribute("data-map-zoom", overviewZoom);
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  const last = editorialPicks.at(-1);
  await page.getByRole("button", { name: `select ${last.name} on map`, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", last.id);
  await expect(page.locator(".picks-carousel-progress")).toHaveCount(0);
  const list = page.getByRole("list", { name: "Swipe through Melloway’s Picks", exact: true });
  await list.press("ArrowUp");
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks.at(-2).id);
  await list.press("ArrowDown");
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", last.id);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const map = await page.locator(".picks-map").boundingBox();
    const cards = await page.locator(".editorial-card-panel").boundingBox();
    expect(map.y + map.height).toBeLessThan(cards.y);
    expect(map.height).toBeGreaterThan(cards.height);
    const tabs = await page.locator(".bottom-tabs").boundingBox();
    expect(cards.y + cards.height).toBeLessThanOrEqual(tabs.y);
    const selected = page.locator(".editorial-place-card.is-selected");
    const card = await selected.boundingBox();
    const address = await selected.locator(".editorial-place-address").boundingBox();
    const details = await selected.getByRole("button", { name: "the details", exact: true }).boundingBox();
    expect(card.height).toBeLessThan(230);
    expect(Math.abs(card.y - cards.y)).toBeLessThan(2);
    expect(Math.abs(card.height - cards.height)).toBeLessThan(2);
    expect(details.y - (address.y + address.height)).toBeLessThanOrEqual(12);
    expect(details.y + details.height).toBeLessThanOrEqual(card.y + card.height);
    expect(await list.evaluate(node => ({ snap: getComputedStyle(node).scrollSnapType,
      scrollHeight: node.scrollHeight, height: node.clientHeight, scrollWidth: node.scrollWidth, width: node.clientWidth })))
      .toEqual(expect.objectContaining({ snap: "y mandatory" }));
    expect(await list.evaluate(node => node.scrollHeight > node.clientHeight * 9 && node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await selected.locator(".editorial-place-copy").evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("explore-ten-spots.png") });
  await page.getByLabel("search suggestions").fill("matchaya");
  await expect(page.getByRole("region", { name: "places", exact: true }).getByRole("link", { name: "view MATCHA-YA", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "clear search", exact: true }).click();
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", last.id);
  await page.reload();
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  expect(requests).toEqual([]);
  expect(await state()).toEqual(before);
});

test("Explore eases the camera, follows the latest pin, and cancels movement on show-all", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page);
  await page.goto("/explore");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const surface = page.locator(".picks-map .google-map-surface");
  const overview = await surface.getAttribute("data-map-zoom");
  async function select(venue) {
    await page.getByRole("button", { name: `select ${venue.name} on map`, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", venue.id);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await select(editorialPicks[0]);
  await expect(surface).toHaveAttribute("data-map-zoom", "16");
  await expect(surface).toHaveAttribute("data-center-lat", String(editorialPicks[0].lat));
  expect(Number(await surface.getAttribute("data-camera-moves"))).toBeGreaterThan(2);
  await select(editorialPicks[1]);
  await select(editorialPicks[2]);
  await expect(surface).toHaveAttribute("data-center-lat", String(editorialPicks[2].lat));
  await expect(surface).toHaveAttribute("data-center-lng", String(editorialPicks[2].lng));
  await expect(surface).toHaveAttribute("data-map-zoom", "16");
  await select(editorialPicks[0]);
  await page.getByRole("button", { name: "show all pick pins", exact: true }).click();
  await expect(surface).toHaveAttribute("data-map-zoom", overview);
  await page.waitForTimeout(750); // A cancelled 650ms transition must not move the map back.
  await expect(surface).toHaveAttribute("data-map-zoom", overview);
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
});

test.describe("Explore vertical reels", () => {
  test.use({ hasTouch: true, reducedMotion: "reduce" });
  for (const width of [390, 320])
    test(`touch swipes move up and down, sync the map and retain details at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await mockPicks(page);
      const requests = [];
      page.on("request", request => {
        if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url());
      });
      await page.goto("/explore");
      await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
      const first = page.locator(".editorial-place-card").first();
      const photo = first.locator(".editorial-place-photo");
      const box = await photo.boundingBox();
      const y = box.y + box.height / 2;
      const session = await page.context().newCDPSession(page);
      for (const [from, to] of [[0.85, 0.15], [0.15, 0.85]]) {
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width * from, y }] });
        for (let step = 1; step <= 10; step++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * (from + (to - from) * step / 10), y }] });
          await page.waitForTimeout(16);
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[0].id);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const list = page.locator(".editorial-place-cards");
      const reel = await list.boundingBox();
      const originalScroll = await page.evaluate(() => scrollY);
      for (const [from, to, index] of [[0.85, 0.15, 1], [0.15, 0.85, 0]]) {
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: reel.x + reel.width / 2, y: reel.y + reel.height * from }] });
        for (let step = 1; step <= 12; step++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: reel.x + reel.width / 2,
            y: reel.y + reel.height * (from + (to - from) * step / 12) }] });
          await page.waitForTimeout(30);
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        const venue = editorialPicks[index];
        await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", venue.id);
        await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(venue.lat));
        await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-map-zoom", "16");
        await expect.poll(() => list.evaluate((node, index) => Math.abs(node.scrollTop - (node.children[0].getBoundingClientRect().height + 12) * index), index)).toBeLessThan(2);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await page.evaluate(() => scrollY)).toBe(originalScroll);
      }
      await photo.tap();
      const sheet = page.getByRole("dialog", { name: editorialPicks[0].name, exact: true });
      await expect(sheet).toBeVisible();
      const bounds = await sheet.boundingBox();
      expect(Math.abs(bounds.y + bounds.height - 844)).toBeLessThan(2);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      await page.screenshot({ path: info.outputPath(`explore-bottom-sheet-${width}.png`) });
      await sheet.getByRole("button", { name: "close pick details" }).tap();
      await expect(sheet).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
      const last = page.locator(".editorial-place-card").last();
      await last.getByRole("button", { name: "the details", exact: true }).tap();
      await expect(page.getByRole("dialog", { name: editorialPicks.at(-1).name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => scrollY)).toBe(originalScroll);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator(".editorial-place-cards").evaluate(list => list.scrollLeft)).toBe(0);
      expect(requests).toEqual([]);
      await session.detach();
    });
});

test("Explore sheets retain unknown prices and access conditions without photo overlays", async ({ page }) => {
  await mockPicks(page, { maps: false, images: false });
  await page.goto("/explore");
  await expect(page.locator(".picks-map-unavailable")).toBeVisible();
  for (const id of ["pick-birdcage-bank-hotel", "pick-o3-newtown", "pick-observatory-hill-park"]) {
    const venue = editorialPicks.find(pick => pick.id === id);
    await page.locator(`[data-venue-id="${id}"]`).getByRole("button", { name: "the details", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: venue.name, exact: true });
    await expect(sheet).toContainText(venue.costLabel);
    await expect(sheet.getByRole("region", { name: "Pick sources and access" })).toContainText(venue.conditions);
    await expect(sheet.getByText("$0 allowance", { exact: true })).toHaveCount(0);
    await expect(sheet.locator(".editorial-photo-placeholder")).toBeVisible();
    await expect(sheet.locator(".editorial-photo-credit")).toHaveCount(0);
    await expect(sheet.getByText(venue.photo.caption, { exact: true })).toHaveCount(0);
    await sheet.getByRole("button", { name: "close pick details" }).click();
  }
});

test("closing a reel returns to the same Explore bottom sheet", async ({ page }) => {
  await mockPicks(page);
  const post = "https://www.tiktok.com/@visitor/video/7123456789012345678";
  let requested;
  await page.route("**/api/status", route => route.fulfill({ json: { socialDiscovery: "openai" } }));
  await page.route("**/api/social/search", route => {
    requested = route.request().postDataJSON().venue;
    return route.fulfill({ json: { posts: [{ url: post, creator: "visitor", caption: "A visit to Chubby Cubby", venueKey: mediaVenueKey(requested) }] } });
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/explore");
  await page.getByRole("button", { name: `view ${editorialPicks[0].name} details`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: editorialPicks[0].name, exact: true });
  const trigger = sheet.getByRole("button", { name: "watch TikTok post by visitor", exact: true });
  await expect(trigger).toBeVisible();
  expect(requested).toEqual({ name: editorialPicks[0].name, address: editorialPicks[0].address,
    lat: editorialPicks[0].lat, lng: editorialPicks[0].lng });
  await trigger.click();
  const player = page.getByRole("dialog", { name: "TikTok", exact: true });
  await expect(player.getByRole("link", { name: "open on TikTok" })).toHaveAttribute("href", post);
  await page.keyboard.press("Escape");
  await expect(player).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await sheet.getByRole("button", { name: "close pick details" }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  expect(errors).toEqual([]);
});

test("desktop keeps the phone-width frame, stacked map and synced horizontal cards", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockPicks(page);
  await page.goto("/picks");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  const shell = await page.locator(".app-shell").boundingBox(), tabs = await page.locator(".bottom-tabs").boundingBox();
  expect(shell.width).toBe(480);
  expect(shell.x).toBe((1440 - shell.width) / 2);
  expect(tabs.width).toBe(shell.width);
  const map = await page.locator(".picks-map").boundingBox(), cards = await page.locator(".editorial-card-panel").boundingBox();
  expect(map.y + map.height).toBeLessThan(cards.y);
  expect(Math.abs(map.height - cards.height)).toBeLessThan(2);
  expect(cards.y + cards.height).toBeLessThanOrEqual(tabs.y);
  await expect(page.getByRole("button", { name: "next pick", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "previous pick", exact: true })).toHaveCount(0);
  const last = editorialPicks.at(-1);
  await page.getByRole("button", { name: `select ${last.name} on map`, exact: true }).click();
  const selected = page.locator(`.editorial-place-card[data-venue-id="${last.id}"]`);
  await expect(selected).toHaveClass(/is-selected/);
  await expect.poll(() => selected.evaluate((node) => {
    const box = node.getBoundingClientRect(), list = node.parentElement.getBoundingClientRect();
    return Math.abs(box.left + box.width / 2 - list.left - list.width / 2) < 2;
  })).toBe(true);
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(last.lat));
  await page.getByRole("button", { name: "show all pick pins" }).click();
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await page.locator(".editorial-place-cards").evaluate((list) => list.scrollTo({ left: list.children[1].offsetLeft - 18, behavior: "instant" }));
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
  await page.screenshot({ path: info.outputPath("picks-desktop.png") });
});

test("mobile swipe and pin selection keep the card and map in sync", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page);
  await page.goto("/picks");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const map = await page.locator(".picks-map").boundingBox(), cards = await page.locator(".editorial-card-panel").boundingBox();
  expect(map.y + map.height).toBeLessThan(cards.y);
  await page.locator(".editorial-place-cards").evaluate((list) => list.scrollTo({ left: list.children[1].offsetLeft - 18, behavior: "instant" }));
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  await expect(page.getByRole("button", { name: `select ${editorialPicks[1].name} on map`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
  // The next place is outside this focused viewport. Keyboard selection also
  // verifies that nearby/overlapping marker buttons remain accessible.
  await page.getByRole("button", { name: `select ${editorialPicks[2].name} on map`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(`.editorial-place-card[data-venue-id="${editorialPicks[2].id}"]`)).toHaveClass(/is-selected/);
  const centered = () => page.locator(`.editorial-place-card[data-venue-id="${editorialPicks[2].id}"]`).evaluate((card) => {
    const box = card.getBoundingClientRect(), list = card.parentElement.getBoundingClientRect();
    return Math.abs(box.left + box.width / 2 - list.left - list.width / 2);
  });
  await expect.poll(centered).toBeLessThan(2);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(centered).toBeLessThan(2);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(centered).toBeLessThan(2);
  await page.getByRole("button", { name: "show all pick pins" }).click();
  await page.screenshot({ path: info.outputPath("picks-mobile.png") });
});

test("all ten Melloway picks appear without filters or editorial copy, preserving local plans", async ({ page }) => {
  await mockPicks(page);
  await page.addInitScript(() => {
    localStorage.setItem("melloway.saved", JSON.stringify([{ id: "existing-saved-pick", title: "Keep this" }]));
    localStorage.setItem("melloway.draft", JSON.stringify({ name: "Existing user" }));
  });
  await page.goto("/picks?collection=shana");
  const before = await page.evaluate(() => ({ saved: localStorage.getItem("melloway.saved"), draft: localStorage.getItem("melloway.draft"), current: localStorage.getItem("melloway.current") }));
  await expect(page.getByRole("group", { name: "Pick collections" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Shana’s picks", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Editorial picks/)).toHaveCount(0);
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await page.reload();
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.locator('[data-venue-id="sydney-glebe-markets"]')).toHaveCount(1);
  const after = await page.evaluate(() => ({ saved: localStorage.getItem("melloway.saved"), draft: localStorage.getItem("melloway.draft"), current: localStorage.getItem("melloway.current") }));
  expect(after).toEqual(before);
  await expect(page.getByRole("link", { name: "view Sydney Matcha Crawl", exact: true })).toBeVisible();
});

test("details retain event/access conditions and the selected card without photo overlays", async ({ page }) => {
  await mockPicks(page);
  await page.goto("/picks/places/pick-birdcage-bank-hotel?collection=melloway");
  await expect(page.getByRole("heading", { name: "Birdcage at The Bank Hotel", exact: true })).toBeVisible();
  await expect(page.locator(".editorial-evidence")).toContainText("Wednesday from 9pm");
  await expect(page.locator(".editorial-evidence")).toContainText("Entry depends on arrival time");
  await expect(page.getByRole("link", { name: "back to all picks" })).toHaveAttribute("href", "/picks?place=pick-birdcage-bank-hotel");
  await page.getByRole("link", { name: "back to all picks" }).click();
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", "pick-birdcage-bank-hotel");
  await page.goto("/picks/places/pick-o3-newtown");
  await expect(page.locator(".editorial-evidence")).toContainText("free membership has limited weekly access");
  await expect(page.locator(".venue dl")).toContainText("Membership applies");
  await page.goto("/picks/places/pick-observatory-hill-park");
  await expect(page.locator(".venue-photo img")).toHaveAttribute("src", editorialPicks.find(v => v.id === "pick-observatory-hill-park").image);
  await expect(page.locator(".venue-photo .pill-label")).toHaveCount(0);
  await expect(page.locator(".editorial-photo-credit")).toHaveCount(0);
  await expect(page.locator(".editorial-evidence")).toContainText("Observatory tours have separate opening times");
});

test("unavailable Google Maps and photos preserve swipe cards without an OpenStreetMap substitute", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page, { maps: false, images: false });
  await page.goto("/picks");
  await expect(page.locator(".picks-map-unavailable")).toContainText("Google Maps couldn’t load.");
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await expect(page.getByText(/OpenStreetMap/)).toHaveCount(0);
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await page.locator(".editorial-place-cards").press("ArrowRight");
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  await page.locator(".editorial-place-cards").press("ArrowRight");
  await expect(page.locator('.editorial-place-card[data-venue-id="sydney-glebe-markets"]')).toHaveClass(/is-selected/);
  await expect(page.locator('.editorial-place-card[data-venue-id="sydney-glebe-markets"] .editorial-photo-placeholder')).toBeVisible();
  await expect(page.locator(".picks-map-unavailable a")).toHaveAttribute("href", /google.com\/maps/);
  await expect(page.getByRole("button", { name: "show all pick pins" })).toBeHidden();
});

test("dragging the photo swipes to the next card and updates its Google marker", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page);
  await page.goto("/picks");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const photo = await page.locator(".editorial-place-photo").first().boundingBox();
  await page.mouse.move(photo.x + photo.width - 30, photo.y + photo.height / 2);
  await page.mouse.down();
  await page.mouse.move(photo.x + 30, photo.y + photo.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  await expect(page.locator(".picks-carousel-progress")).toHaveText("swipe to explore");
  await expect(page.locator(".picks-carousel-dots")).toHaveCount(0);
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
  await expect(page.locator(".editorial-place-cards")).not.toHaveClass(/is-dragging/);
  await page.screenshot({ path: info.outputPath("picks-swipe.png") });
});

// The real SDK chooses zoom from these bounds/padding; this fixture records the
// requested viewport without loading Google or requiring a browser key.
for (const path of ["/explore", "/picks"]) test(`${path} show-all fits all ten pins tightly after a selected-place zoom`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockPicks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const surface = page.locator(".picks-map .google-map-surface");
  const padding = JSON.stringify({ top: 40, bottom: 20, left: 24, right: 24 });
  const bounds = JSON.stringify(editorialPicks.map(({ lat, lng }) => ({ lat, lng })));
  await expect(surface).toHaveAttribute("data-fit-padding", padding);
  const overviewZoom = await surface.getAttribute("data-map-zoom");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const place = editorialPicks.at(-1);
    await page.getByRole("button", { name: `select ${place.name} on map`, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(surface).toHaveAttribute("data-map-zoom", "16");
    const fits = Number(await surface.getAttribute("data-fit-count"));
    const showAll = page.getByRole("button", { name: "show all pick pins" });
    await showAll.click();
    await expect.poll(async () => Number(await surface.getAttribute("data-fit-count"))).toBeGreaterThan(fits);
    await expect(surface).toHaveAttribute("data-fit-padding", padding);
    await expect(surface).toHaveAttribute("data-fitted-points", bounds);
    await expect(surface).toHaveAttribute("data-map-zoom", overviewZoom);
    await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
    await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", place.id);
    const repeatedFits = Number(await surface.getAttribute("data-fit-count"));
    await showAll.click();
    await expect.poll(async () => Number(await surface.getAttribute("data-fit-count"))).toBeGreaterThan(repeatedFits);
  }
});

for (const path of ["/explore", "/picks"]) test(`${path} has compact pointed place-icon pins with accessible selection`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page);
  await page.goto(path);
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  const pins = page.locator(".editorial-pick-pin");
  await expect(pins).toHaveCount(10);
  await expect(pins).toHaveText(Array(10).fill(""));
  await expect(pins.locator("img[aria-hidden=true][alt='']")).toHaveCount(10);
  for (const pin of await pins.all()) {
    await expect.poll(() => pin.locator("img").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const shape = await pin.evaluate(button => {
      const style = getComputedStyle(button), tip = getComputedStyle(button, "::after");
      return { width: parseFloat(style.width), height: parseFloat(style.height), tip: tip.content,
        tipHeight: parseFloat(tip.height), tipBottom: parseFloat(tip.bottom) };
    });
    expect(shape.width).toBeLessThan(36);
    expect(shape.height).toBeLessThan(36);
    expect(shape.tip).not.toBe("none");
    expect(shape.tipHeight).toBeGreaterThan(0);
    expect(shape.tipBottom).toBeLessThan(0);
  }
  const camera = page.getByRole("button", { name: `select ${editorialPicks[1].name} on map`, exact: true });
  await expect(camera.locator("img")).toHaveAttribute("src", "/icons/optimized/yellow_camera.png");
  await expect(pins.first().locator("img")).toHaveAttribute("src", "/icons/optimized/green_matcha.png");
  await page.screenshot({ path: info.outputPath(`icon-pins-${path.slice(1)}.png`) });
  await camera.focus();
  await page.keyboard.press("Enter");
  await expect(camera).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  await page.getByRole("button", { name: "show all pick pins" }).click();
  await expect(pins).toHaveCount(10);
  await expect(camera).toHaveAttribute("aria-pressed", "true");
});

test("all ten supplied image links render without credit or caption overlays", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page, { maps: false });
  await page.goto("/picks");
  for (const venue of editorialPicks) {
    const id = venue.id;
    const card = page.locator(`.editorial-place-card[data-venue-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    const image = card.getByRole("img", { name: venue.photo.caption, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth)).toBe(1280);
    expect(await image.evaluate(node => node.currentSrc)).toBe(venue.image);
    await expect(card.locator(".editorial-photo-credit")).toHaveCount(0);
    await expect(card.getByText(venue.photo.caption, { exact: true })).toHaveCount(0);
    await expect(card.getByText(venue.photo.author, { exact: true })).toHaveCount(0);
    await expect(card.getByText(venue.photo.license, { exact: true })).toHaveCount(0);
    await card.screenshot({ path: info.outputPath(`${id}.png`) });
  }
});

test("failed supplied images retain all ten pick cards and their placeholders", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page, { maps: false, images: false });
  await page.goto("/picks");
  for (const venue of editorialPicks) {
    const card = page.locator(`.editorial-place-card[data-venue-id="${venue.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator(".editorial-photo-placeholder")).toBeVisible();
    const image = card.getByRole("img", { name: venue.photo.caption, exact: true, includeHidden: true });
    await expect(image).toHaveAttribute("src", venue.image);
    await expect(image).toBeHidden();
    await expect(card).toContainText(venue.name);
  }
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
});
