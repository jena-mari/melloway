import { test, expect } from "@playwright/test";
import { editorialPicks } from "../../src/data/editorialPicks.js";
import { googleMapsFixture } from "./google-maps-fixture.js";
import { mockMapTiles } from "./fixtures.js";

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

test("desktop map and cards split evenly, with ten selectable unique pins", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockPicks(page);
  await page.goto("/picks");
  await expect(page.locator(".picks-map-canvas")).toHaveAttribute("data-map-state", "ready");
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  const map = await page.locator(".picks-map").boundingBox(), cards = await page.locator(".editorial-card-panel").boundingBox();
  expect(Math.abs(map.width - cards.width)).toBeLessThan(2);
  expect(map.x).toBeLessThan(cards.x);
  const last = editorialPicks.at(-1);
  await page.getByRole("button", { name: `select ${last.name} on map`, exact: true }).click();
  const selected = page.locator(`.editorial-place-card[data-venue-id="${last.id}"]`);
  await expect(selected).toHaveClass(/is-selected/);
  await expect.poll(() => selected.evaluate((node) => {
    const box = node.getBoundingClientRect(), list = node.parentElement.getBoundingClientRect();
    return box.top >= list.top && box.top < list.bottom;
  })).toBe(true);
  await expect(page.locator(".picks-map .google-map-surface")).toHaveAttribute("data-center-lat", String(last.lat));
  await page.getByRole("button", { name: "show all pick pins" }).click();
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
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

test("collection filters share Glebe once and browsing preserves local plans", async ({ page }) => {
  await mockPicks(page);
  await page.addInitScript(() => {
    localStorage.setItem("melloway.saved", JSON.stringify([{ id: "existing-saved-pick", title: "Keep this" }]));
    localStorage.setItem("melloway.draft", JSON.stringify({ name: "Existing user" }));
  });
  await page.goto("/picks");
  const before = await page.evaluate(() => ({ saved: localStorage.getItem("melloway.saved"), draft: localStorage.getItem("melloway.draft"), current: localStorage.getItem("melloway.current") }));
  await page.getByRole("button", { name: "Shana’s picks", exact: true }).click();
  await expect(page.locator(".editorial-place-card")).toHaveCount(1);
  await expect(page.locator(".editorial-place-card")).toHaveAttribute("data-venue-id", "sydney-glebe-markets");
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Shana’s picks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Melloway’s picks", exact: true }).click();
  await expect(page.locator(".editorial-place-card")).toHaveCount(10);
  await expect(page.locator('[data-venue-id="sydney-glebe-markets"]')).toHaveCount(1);
  const after = await page.evaluate(() => ({ saved: localStorage.getItem("melloway.saved"), draft: localStorage.getItem("melloway.draft"), current: localStorage.getItem("melloway.current") }));
  expect(after).toEqual(before);
  await expect(page.getByRole("link", { name: "view Sydney Matcha Crawl", exact: true })).toBeVisible();
});

test("details retain event/access conditions, licensing and the chosen filter", async ({ page }) => {
  await mockPicks(page);
  await page.goto("/picks/places/pick-birdcage-bank-hotel?collection=melloway");
  await expect(page.getByRole("heading", { name: "Birdcage at The Bank Hotel", exact: true })).toBeVisible();
  await expect(page.locator(".editorial-evidence")).toContainText("Wednesday from 9pm");
  await expect(page.locator(".editorial-evidence")).toContainText("Entry depends on arrival time");
  await expect(page.getByRole("link", { name: "back to all picks" })).toHaveAttribute("href", /collection=melloway/);
  await page.getByRole("link", { name: "back to all picks" }).click();
  await expect(page.getByRole("button", { name: "Melloway’s picks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".picks-map")).toHaveAttribute("data-selected-place", "pick-birdcage-bank-hotel");
  await page.goto("/picks/places/pick-o3-newtown");
  await expect(page.locator(".editorial-evidence")).toContainText("free membership has limited weekly access");
  await expect(page.locator(".venue dl")).toContainText("Membership applies");
  await page.goto("/picks/places/pick-observatory-hill-park");
  await expect(page.locator(".venue-photo")).toContainText("MDRX");
  await expect(page.locator(".venue-photo")).toContainText("CC BY-SA 4.0");
  await expect(page.locator(".editorial-evidence")).toContainText("Observatory tours have separate opening times");
});

test("no map keys or failed photos still leave ten interactive pins and honest cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPicks(page, { maps: false, images: false });
  await page.goto("/picks");
  await expect(page.locator(".picks-street-map")).toBeVisible();
  await expect(page.locator(".editorial-pick-pin")).toHaveCount(10);
  await page.getByRole("button", { name: "select Glebe Markets on map", exact: true }).click();
  await expect(page.locator('.editorial-place-card[data-venue-id="sydney-glebe-markets"]')).toHaveClass(/is-selected/);
  await expect(page.locator('.editorial-place-card[data-venue-id="sydney-glebe-markets"] .editorial-photo-placeholder')).toBeVisible();
  await expect(page.getByRole("button", { name: "show all pick pins" })).toBeVisible();
});
