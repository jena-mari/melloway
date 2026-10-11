import { test, expect } from '@playwright/test';
import { sydneyVenues } from '../../src/data/sydneyVenues.js';
import { defaultDraft } from '../../src/data/preferences.js';
import { editRoute, demoMatrix } from '../../src/utils/planner.js';
import { mediaVenueKey } from '../../packages/domain/src/venueMedia.ts';
const garden = sydneyVenues.find(v => v.id === 'sydney-botanic-garden');
const url = 'https://www.tiktok.com/@fixture/video/7123456789012345678';
test('gallery, saved places and optimized insertion preserve the active route and fixed times', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route('https://**', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/status', route => route.fulfill({ json: { socialDiscovery: 'openai' } }));
  await page.route('**/api/social/search', route => route.fulfill({ json: { posts: [
    { url, caption: 'Quiet and cosy garden.', venueKey: mediaVenueKey(garden), metadataSource: 'source-excerpt' },
    { url: 'https://www.instagram.com/reel/WrongBranch123/', caption: 'Other garden', venueKey: 'wrong branch' },
  ] } }));
  const prefs = { ...defaultDraft(), date: '2026-10-12', duration: 8, budget: 100, transport: 'Not selected' };
  const a = { ...garden, id: 'a', name: 'Fixture A', mins: 30, arrivalOverride: 720 }, b = { ...garden, id: 'b', name: 'Fixture B', mins: 30, lng: garden.lng + .001 };
  const matrix = demoMatrix([a, b], prefs.transport);
  const plan = { ...editRoute([a, b], prefs, [a, b], matrix), prefs, id: 'active-fixture', status: 'in-progress', startedAt: '2026-10-12T01:00:00Z' };
  await page.addInitScript(bundle => { if (!localStorage.getItem('melloway.current')) localStorage.setItem('melloway.current', JSON.stringify(bundle)); }, { plan, candidates: [a, b], matrix });
  await page.goto(`/venue/${garden.id}`);
  await expect(page.locator('.venue-social-card')).toHaveCount(1);
  await expect(page.getByText(/From captions.*quiet.*relaxed/)).toBeVisible();
  await page.getByRole('button', { name: `save ${garden.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'add to itinerary', exact: true }).click();
  await expect(page.getByRole('button', { name: 'in your day', exact: true })).toBeVisible();
  const updated = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
  expect(updated.plan.id).toBe(plan.id); expect(updated.plan.startedAt).toBe(plan.startedAt);
  expect(updated.plan.stops.filter(s => s.id !== garden.id).map(s => s.id)).toEqual(['a', 'b']);
  expect(updated.plan.stops.find(s => s.id === 'a').arrival).toBe(720);
  expect(updated.matrix).toHaveLength(3);
  await page.reload();
  await expect(page.getByRole('button', { name: `unsave ${garden.name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/favourites?tab=places');
  await expect(page.getByRole('link', { name: new RegExp(garden.name) })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
