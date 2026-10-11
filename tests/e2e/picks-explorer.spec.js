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

test("Explore immediately shows ten mapped swipe cards without suggestion API calls or changing the plan", async ({ page }, info) => {
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
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "show suggestions", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Nearby spot suggestions" })).toHaveCount(0);
  const carousel = page.getByRole("list", { name: "Swipe through Melloway’s Picks" });
  await carousel.press("ArrowDown");
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
  expect(new URL(page.url()).searchParams.get("keep")).toBe("1");
  await page.getByRole("button", { name: "show all pick pins" }).click();
  const last = editorialPicks.at(-1);
  await page.getByRole("button", { name: `select ${last.name} on map`, exact: true }).click();
  await expect(page.locator(".picks-carousel-progress")).toContainText("10 / 10");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const map = await page.locator(".picks-map").boundingBox();
    const cards = await page.locator(".editorial-card-panel").boundingBox();
    const tabs = await page.locator(".bottom-tabs").boundingBox();
    expect(map.y + map.height).toBeLessThan(cards.y);
    expect(cards.y + cards.height).toBeLessThanOrEqual(tabs.y);
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

test.describe("Explore reel swipes", () => {
  test.use({ hasTouch: true, reducedMotion: "reduce" });
  for (const width of [390, 320])
    test(`vertical touch swipes follow the spot on the map at ${width}px without fetching suggestions`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await mockPicks(page);
      const requests = [];
      page.on("request", request => {
        if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/"))
          requests.push(request.url());
      });
      await page.goto("/explore");
      await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
      const feed = page.getByRole("list", { name: "Swipe through Melloway’s Picks" });
      const pageScroll = await page.evaluate(() => scrollY);
      const session = await page.context().newCDPSession(page);
      async function swipe(start, end) {
        const box = await feed.boundingBox();
        const x = box.x + box.width / 2;
        const from = box.y + box.height * start, to = box.y + box.height * end;
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
        for (let step = 1; step <= 10; step++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: from + (to - from) * step / 10 }] });
          await page.waitForTimeout(16); // Pace a real touch gesture over multiple animation frames.
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      // Start on the caption and swipe up, then start on the photo and swipe down.
      await swipe(0.82, 0.12);
      await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[1].id);
      await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
      await expect(page.locator(".picks-carousel-progress")).toContainText("2 / 10 · swipe up or down");
      const centered = () => feed.evaluate(list => {
        const card = list.querySelector(".is-selected").getBoundingClientRect();
        const box = list.getBoundingClientRect();
        return Math.abs(card.top + card.height / 2 - box.top - box.height / 2);
      });
      await expect.poll(centered).toBeLessThan(2);
      const details = page.locator(".editorial-place-card.is-selected").getByRole("link", { name: "the details", exact: true });
      await expect(details).toBeInViewport();
      await swipe(0.12, 0.82);
      await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", editorialPicks[0].id);
      await expect.poll(centered).toBeLessThan(2);
      expect(await feed.evaluate(list => list.scrollLeft)).toBe(0);
      expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
      expect(requests).toEqual([]);
      await page.screenshot({ path: info.outputPath(`explore-reels-${width}.png`) });
      await session.detach();
    });
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
  await expect(page.locator(".picks-carousel-progress")).toContainText("2 / 10");
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(editorialPicks[1].lat));
  await expect(page.locator(".editorial-place-cards")).not.toHaveClass(/is-dragging/);
  await page.screenshot({ path: info.outputPath("picks-swipe.png") });
});
