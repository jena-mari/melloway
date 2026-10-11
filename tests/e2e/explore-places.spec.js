import { test, expect } from "@playwright/test";
import { sydneyVenues } from "../../src/data/sydneyVenues.js";
import { communityExamples } from "../../src/data/community.js";

const matchaya = sydneyVenues.find(venue => venue.id === "sydney-matchaya");
const shared = "https://www.tiktok.com/@fixture/video/7123456789012345678";

async function plannerState(page) {
  return page.evaluate(() => Object.fromEntries(
    ["melloway.draft", "melloway.current", "melloway.saved"].map(key =>
      [key, localStorage.getItem(key)]),
  ));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://**", route => route.abort());
  await page.route("**/api/**", route => route.fulfill({
    status: 503, json: { error: "Offline test fixture" },
  }));
  await page.route("**/api/status", route => route.fulfill({
    json: { venues: "curated", recommendations: "planner", socialDiscovery: "unavailable" },
  }));
});

test("Explore finds real matcha places, opens MATCHA-YA and retains the search and saved reel", async ({ page }) => {
  const current = { plan: communityExamples()[1].plan, candidates: [], matrix: [] };
  await page.addInitScript(({ current, venue, url }) => {
    if (localStorage.getItem("explore-fixture")) return;
    localStorage.setItem("explore-fixture", "1");
    localStorage.setItem("melloway.current", JSON.stringify(current));
    localStorage.setItem(`melloway.social.${JSON.stringify([venue.name, venue.lat, venue.lng])}`,
      JSON.stringify([url]));
  }, { current, venue: matchaya, url: shared });
  await page.goto("/explore");
  const before = await plannerState(page);
  await page.getByLabel("search suggestions").fill("matcha");
  const places = page.getByRole("region", { name: "places", exact: true });
  for (const name of ["MATCHA-YA", "Issho Cafe", "Chubby Cubby Café", "MaMUKI Bake Bar — Glebe"])
    await expect(places.getByRole("link", { name: `view ${name}`, exact: true })).toBeVisible();
  const result = places.getByRole("link", { name: "view MATCHA-YA", exact: true });
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute("href", "/venue/sydney-matchaya");
  await expect(page.locator(".community-empty")).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await places.screenshot({ path: "/private/tmp/melloway-explore-places.png" });
  await result.click();
  await expect(page).toHaveURL(/\/venue\/sydney-matchaya$/);
  await expect(page.getByRole("heading", { name: "MATCHA-YA", exact: true })).toBeVisible();
  await expect(page.getByText(/10 Steam Mill Lane/).first()).toBeVisible();
  await expect(page.locator(".venue-social-card")).toHaveCount(1);
  await page.getByRole("button", { name: /watch TikTok post/ }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "open on TikTok" })).toHaveAttribute("href", shared);
  await page.getByRole("button", { name: "close post", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/explore\?q=matcha$/);
  await expect(page.getByLabel("search suggestions")).toHaveValue("matcha");
  await expect(result).toBeVisible();
  expect(await plannerState(page)).toEqual(before);
});

test("compact café names and addresses find places even without matching community posts", async ({ page }) => {
  await page.goto("/explore?q=matchaya");
  const places = page.getByRole("region", { name: "places", exact: true });
  await expect(places.getByRole("link", { name: "view MATCHA-YA", exact: true })).toBeVisible();
  await expect(page.locator(".community-post")).toHaveCount(0);
  await expect(page.locator(".community-empty")).toHaveCount(0);
  await page.getByLabel("search suggestions").fill("Steam Mill");
  await expect(places.getByRole("link", { name: "view MATCHA-YA", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("search suggestions")).toHaveValue("Steam Mill");
  await expect(places.getByRole("link", { name: "view MATCHA-YA", exact: true })).toBeVisible();
});

test("editorial and crawl places open their existing detail routes", async ({ page }) => {
  await page.goto("/explore?q=Glebe%20bakery");
  const places = page.getByRole("region", { name: "places", exact: true });
  await places.getByRole("link", { name: "view MaMUKI Bake Bar — Glebe", exact: true }).click();
  await expect(page).toHaveURL(/\/picks\/places\/pick-mamuki-glebe$/);
  await expect(page.getByRole("heading", { name: "MaMUKI Bake Bar — Glebe", exact: true })).toBeVisible();
  await page.goto("/explore?q=Issho");
  await places.getByRole("link", { name: "view Issho Cafe", exact: true }).click();
  await expect(page).toHaveURL(/\/picks\/sydney-matcha-crawl\/venue\/pick-matcha-issho/);
  await expect(page.getByRole("heading", { name: "Issho Cafe", exact: true })).toBeVisible();
});

test("unmatched search and clearing restore suggestions while Feed stays posts only", async ({ page }) => {
  await page.goto("/explore?keep=1&q=unlisted-place-zzzz");
  await expect(page.getByRole("region", { name: "places", exact: true })).toHaveCount(0);
  await expect(page.locator(".suggestion-feed")).toHaveCount(0);
  await page.getByRole("button", { name: "clear search", exact: true }).click();
  await expect(page.getByLabel("search suggestions")).toHaveValue("");
  await expect(page).toHaveURL(/\/explore\?keep=1$/);
  await expect(page.locator(".suggestion-feed")).toBeVisible();
  await expect(page.getByRole("region", { name: "places", exact: true })).toHaveCount(0);
  await page.getByLabel("search suggestions").fill("unlisted-place-zzzz");
  await page.getByRole("button", { name: "clear search", exact: true }).click();
  await expect(page.getByLabel("search suggestions")).toHaveValue("");
  await expect(page.locator(".suggestion-feed")).toBeVisible();
  await page.goto("/community?q=matcha");
  await expect(page.locator(".community-post").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "places", exact: true })).toHaveCount(0);
  await expect(page.locator(".route-extras")).toHaveCount(0);
});
