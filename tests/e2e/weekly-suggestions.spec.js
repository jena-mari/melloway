import { test, expect } from "@playwright/test";
import { mockMapTiles } from "./fixtures.js";
import { communityExamples } from "../../src/data/community.js";

test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.clock.setFixedTime(new Date("2026-10-11T01:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/status", route => route.fulfill({ json: { venues: "curated", recommendations: "planner", socialDiscovery: "unavailable" } }));
  await page.route("**/api/events?**", route => route.fulfill({ status: 503, json: { error: "Ticketmaster unavailable in this test" } }));
});

test("suggestions belong to Explore while Feed and What’s On stay separate", async ({ page }, info) => {
  await page.goto("/community");
  expect((await page.locator(".community-post").first().boundingBox()).y).toBeLessThan(100);
  await expect(page.locator(".weekly-suggestions, .melloway-picks, .route-extras")).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(3);
  await expect(nav.getByRole("link", { name: "saved", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "the community", exact: true })).toContainText("feed");
  await expect(nav.getByRole("link", { name: "what’s on", exact: true })).toHaveCount(0);
  await nav.getByRole("link", { name: "explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  const weekly = page.getByRole("region", { name: "Weekly Suggestions" });
  await expect(weekly.getByRole("link")).toHaveCount(3);
  await expect(weekly).toContainText("5 Oct – 11 Oct");
  await expect(page.getByRole("region", { name: "melloway picks" })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: info.outputPath("explore-390.png") });
  await page.getByLabel("search suggestions").fill("ice skating");
  await weekly.getByRole("link", { name: "view Macquarie Ice Rink" }).click();
  await expect(page.getByRole("heading", { name: "Macquarie Ice Rink", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "venue details", exact: true })).toHaveAttribute("href", "https://macquarieicerink.com.au/");
  await expect(page.getByRole("link", { name: "directions", exact: true })).toHaveAttribute("href", /Macquarie/);
  await page.getByRole("link", { name: "explore", exact: true }).first().click();
  await page.getByRole("link", { name: "what’s on", exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(weekly).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Upcoming Sydney highlights" })).toBeVisible();
  await expect(page.getByText("sample posters · dates & venues unconfirmed")).toHaveCount(0);
});

test("planning a weekly suggestion keeps the existing route and budget; browsing does not change answers", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(plan => {
    localStorage.setItem("melloway.current", JSON.stringify({ plan, candidates: [], matrix: [] }));
    const draft = JSON.parse(localStorage.getItem("melloway.draft"));
    localStorage.setItem("melloway.draft", JSON.stringify({ ...draft, name: "Jena", budget: 45, notes: "Vegetarian please.", preferences: ["Desserts"] }));
  }, communityExamples()[1].plan);
  await page.goto("/weekly/astros-arcade-bar");
  const before = await page.evaluate(() => ({ current: localStorage.getItem("melloway.current"), draft: localStorage.getItem("melloway.draft") }));
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("melloway.draft"))).toBe(before.draft);
  await page.getByRole("button", { name: "plan around this", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/vibes$/);
  const after = await page.evaluate(() => ({ current: localStorage.getItem("melloway.current"), draft: JSON.parse(localStorage.getItem("melloway.draft")) }));
  expect(after.current).toBe(before.current);
  expect(after.draft.budget).toBe(45);
  expect(after.draft.preferences).toEqual(["Desserts", "Arcades"]);
  expect(after.draft.notes).toMatch(/Vegetarian please\.[\s\S]*Astro’s Arcade Bar/);
  await page.goto("/explore");
  await expect(page.locator(".weekly-label strong").first()).toHaveText("Astro’s Arcade Bar");
});

test("Explore works before planning; only an explicit action updates the draft", async ({ page }) => {
  await page.goto("/explore");
  const before = await page.evaluate(() => ({ current: localStorage.getItem("melloway.current"), draft: localStorage.getItem("melloway.draft") }));
  await page.getByRole("button", { name: "show suggestions", exact: true }).click();
  await page.getByLabel("search suggestions").fill("Mapo");
  const feed = page.getByRole("list", { name: "Nearby spot suggestions" });
  await expect(feed.locator(":scope > li")).toHaveCount(1);
  await expect(feed).not.toContainText("doesn’t fit");
  await feed.getByRole("button", { name: "preview Mapo Newtown" }).click();
  const details = page.getByRole("dialog", { name: "Mapo Newtown", exact: true });
  await expect(details).toContainText("Newtown");
  expect(await page.evaluate(() => ({ current: localStorage.getItem("melloway.current"), draft: localStorage.getItem("melloway.draft") }))).toEqual(before);
  await details.getByRole("button", { name: "plan around this", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/profile$/);
  const after = await page.evaluate(() => ({ current: localStorage.getItem("melloway.current"), draft: JSON.parse(localStorage.getItem("melloway.draft")) }));
  expect(after.current).toBe(before.current);
  expect(after.draft.area).toBe("Newtown");
  expect(after.draft.budget).toBe(JSON.parse(before.draft).budget);
  expect(after.draft.notes).toContain("Mapo Newtown");
});
