import { test, expect } from "@playwright/test";
import { editorialPicks } from "../../src/data/editorialPicks.js";
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
  await page.route("https://upload.wikimedia.org/**", (route) => images
    ? route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#cbd8bc"/><text x="160" y="300" font-size="28">Licensed photo test fixture</text></svg>' })
    : route.abort());
}

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

test("Explore sheets retain unknown prices, access conditions and licensed photos", async ({ page }) => {
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
    if (venue.photo) {
      await expect(sheet.getByRole("link", { name: venue.photo.license, exact: true }).first()).toHaveAttribute("href", venue.photo.licenseUrl);
      await expect(sheet).toContainText(venue.photo.author);
    }
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
    return route.fulfill({ json: { posts: [{ url: post, creator: "visitor", caption: "A visit to Chubby Cubby" }] } });
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

test("details retain event/access conditions, licensing and the selected card", async ({ page }) => {
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
  await expect(page.locator(".venue-photo")).toContainText("MDRX");
  await expect(page.locator(".venue-photo")).toContainText("CC BY-SA 4.0");
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
