import { test, expect } from "@playwright/test";
import { communityExamples } from "../../src/data/community.js";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-11T01:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/status", route => route.fulfill({ json: { venues: "curated", recommendations: "planner", socialDiscovery: "unavailable" } }));
  await page.route("**/api/events?**", route => route.fulfill({ status: 503, json: { error: "Ticketmaster unavailable in this test" } }));
});

test("weekly highlights keep the community opening compact and work in event search", async ({ page }) => {
  await page.goto("/community");
  expect((await page.locator(".community-post").first().boundingBox()).y).toBeLessThan(100);
  const weekly = page.getByRole("region", { name: "Weekly Suggestions" });
  await expect(weekly.getByRole("link")).toHaveCount(3);
  await expect(weekly).toContainText("5 Oct – 11 Oct");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel("search ideas").fill("ice skating");
  await weekly.getByRole("link", { name: "view Macquarie Ice Rink" }).click();
  await expect(page.getByRole("heading", { name: "Macquarie Ice Rink", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "venue details", exact: true })).toHaveAttribute("href", "https://macquarieicerink.com.au/");
  await expect(page.getByRole("link", { name: "directions", exact: true })).toHaveAttribute("href", /Macquarie/);
  await page.goto("/events");
  await page.getByLabel("search events").fill("caterpillar");
  await expect(weekly.getByRole("link")).toHaveCount(1);
  await expect(weekly).toContainText("The Caterpillar Club");
  await expect(page.getByText("nothing like that here yet.")).toHaveCount(0);
  await page.getByRole("button", { name: "saved", exact: true }).click();
  await expect(weekly).toHaveCount(0);
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
  await page.goto("/community");
  await expect(page.locator(".weekly-label strong").first()).toHaveText("Astro’s Arcade Bar");
});
