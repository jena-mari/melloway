import { test, expect } from "@playwright/test";
import { editorialPicks } from "../../src/data/editorialPicks.js";
import { venuePostLinks } from "../../src/data/venuePosts.ts";
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

  expect(editorialPicks.filter(venue => venuePostLinks(venue).length >= 2).length).toBeGreaterThan(5);

  for (const venue of editorialPicks) {
    const urls = venuePostLinks(venue);
    expect(urls.length).toBeGreaterThanOrEqual(1);
    expect(urls.length).toBeLessThanOrEqual(3);
    expect(new Set(urls).size).toBe(urls.length);
    await page.goto(`/explore?place=${venue.id}`);
    await page.getByRole("button", { name: `view ${venue.name} details`, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: venue.name, exact: true });
    const cards = sheet.locator(".venue-social-card");
    await expect(cards).toHaveCount(urls.length);
    expect(await sheet.locator(".venue-social-item").evaluateAll(items => items.map(item => item.dataset.postUrl))).toEqual(urls);
    await expect(sheet.locator(".social-card-caption, .social-original, .social-remove")).toHaveCount(0);
    if (venue === editorialPicks[0]) {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const bounds = await sheet.locator(".venue-social").boundingBox();
        // The existing rail scrolls on narrow phones; every reel must be reachable.
        expect(await sheet.locator(".venue-social-grid").evaluate(node => getComputedStyle(node).overflowX)).toBe("auto");
        for (const card of await cards.all()) {
          await card.scrollIntoViewIfNeeded();
          await expect(card).toBeInViewport({ ratio: 1 });
          const box = await card.boundingBox();
          expect(box.x).toBeGreaterThanOrEqual(bounds.x);
          expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
        }
        await sheet.locator(".venue-social").screenshot({ path: info.outputPath(`pick-reel-grid-${width}.png`) });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    for (const [index, url] of urls.entries()) {
      expect(url).toMatch(/^https:\/\/www\.tiktok\.com\/@[\w.-]+\/video\/\d{15,25}$/);
      await expect(sheet.locator(".venue-social-item").nth(index).locator(".social-card-media iframe"))
        .toHaveAttribute("src", new RegExp(url.split("/").at(-1)));
      const card = cards.nth(index);
      await card.click();
      const player = page.getByRole("dialog", { name: "TikTok", exact: true });
      await expect(player.getByRole("link", { name: "open on TikTok" })).toHaveAttribute("href", url);
      await page.keyboard.press("Escape");
      await expect(player).toHaveCount(0);
      await expect(sheet).toBeVisible();
      await expect(card).toBeFocused();
    }
    await page.keyboard.press("Escape");

    await page.goto(`/picks/places/${venue.id}`);
    await page.reload();
    await expect(page.locator(".venue-social-card")).toHaveCount(urls.length);
    expect(await page.locator(".venue-social-item").evaluateAll(items => items.map(item => item.dataset.postUrl))).toEqual(urls);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("melloway.social.")))).toEqual([]);
  }
  expect(searches).toBe(0);
});
