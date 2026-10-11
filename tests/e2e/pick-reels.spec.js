import { test, expect } from "@playwright/test";
import { editorialPicks } from "../../src/data/editorialPicks.js";
import { mockMapTiles } from "./fixtures.js";

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

test("all ten Picks retain attached TikTok reels across detail sheets, spot pages and reloads without discovery", async ({ page }, info) => {
  let searches = 0;
  await page.route("https://**", route => route.abort());
  await mockMapTiles(page);
  await page.route("**/api/status", route => route.fulfill({ json: { socialDiscovery: "unavailable" } }));
  await page.route("**/api/social/search", route => {
    searches++;
    return route.fulfill({ json: { posts: [] } });
  });
  await page.route("**/api/social/preview", route => route.fulfill({ status: 503, json: {} }));

  for (const venue of editorialPicks) {
    await page.goto(`/explore?place=${venue.id}`);
    await page.getByRole("button", { name: `view ${venue.name} details`, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: venue.name, exact: true });
    const card = sheet.locator(".venue-social-card");
    await expect(card).toHaveCount(1);
    const url = await sheet.locator(".venue-social-item").getAttribute("data-post-url");
    expect(url).toMatch(/^https:\/\/www\.tiktok\.com\/@[\w.-]+\/video\/\d{15,25}$/);
    await expect(sheet.locator(".social-card-caption, .social-original, .social-remove")).toHaveCount(0);
    await expect(sheet.locator(".social-card-media iframe")).toHaveAttribute("src", new RegExp(url.split("/").at(-1)));
    if (venue === editorialPicks[0]) await sheet.locator(".venue-social").screenshot({ path: info.outputPath("pick-reel-grid.png") });
    await card.click();
    const player = page.getByRole("dialog", { name: "TikTok", exact: true });
    await expect(player.getByRole("link", { name: "open on TikTok" })).toHaveAttribute("href", url);
    await page.keyboard.press("Escape");
    await expect(player).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(card).toBeFocused();
    await page.keyboard.press("Escape");

    await page.goto(`/picks/places/${venue.id}`);
    await page.reload();
    await expect(page.locator(".venue-social-item")).toHaveAttribute("data-post-url", url);
    await expect(page.locator(".venue-social-card")).toHaveCount(1);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("melloway.social.")))).toEqual([]);
  }
  expect(searches).toBe(0);
});
