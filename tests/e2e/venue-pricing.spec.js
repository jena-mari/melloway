import { test, expect } from '@playwright/test';
import { defaultDraft } from '../../src/data/preferences.js';
import { schedule, demoMatrix } from '../../src/utils/planner.js';
import { mockMapTiles } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const prefs = { ...defaultDraft(), area: 'Sydney CBD', date: '2026-10-18', budget: 100,
  preferences: [], duration: 8, activityBudgets: { activities: 50 } };
const base = { category: 'skate park', tags: ['skate park'], roles: ['activity'], mins: 30,
  lat: -33.872, lng: 151.208, source: 'google', area: 'Sydney CBD',
  weeklyHours: Array.from({ length: 7 }, () => [{ open: 0, close: 1440 }]),
  hoursStatus: 'published', note: 'Synthetic pricing fixture only.' };
const venues = [
  { ...base, id: 'fixture-public', name: 'Fixture Public Skate Park', address: 'Fixture Public Street, Sydney NSW',
    cost: 0, priceStatus: 'free', priceLevel: 'PRICE_LEVEL_FREE' },
  { ...base, id: 'fixture-private', name: 'Fixture Private Skate Park', address: 'Fixture Private Street, Sydney NSW',
    cost: 35, priceStatus: 'unknown', priceLevel: null, lat: base.lat + .001 },
];
const matrix = demoMatrix(venues, prefs.transport);
const plan = { ...schedule(venues, prefs, matrix, [0, 1]), prefs, id: 'pricing-fixture', notice: 'Offline fixtures.' };

test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.route('**/api/venue-reviews?**', route => route.fulfill({ json: { reviews: [], status: 'unavailable' } }));
  await page.addInitScript(bundle => localStorage.setItem('melloway.current', JSON.stringify(bundle)), { plan, candidates: venues, matrix });
});

test('free admission and unknown allowance stay distinct in stop details and spotlight', async ({ page }, info) => {
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'view Fixture Public Skate Park details', exact: true }).click();
  const freePanel = page.getByRole('region', { name: 'Fixture Public Skate Park stop details', exact: true });
  await expect(freePanel).toContainText('free entry · $0');
  await expect(freePanel).not.toContainText('$35');
  await page.screenshot({ path: info.outputPath('free-entry.png') });
  await freePanel.getByRole('link', { name: 'View Details', exact: true }).click();
  await expect(page.getByRole('definition').first()).toHaveText('free entry · $0');
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'view Fixture Private Skate Park details', exact: true }).click();
  const unknownPanel = page.getByRole('region', { name: 'Fixture Private Skate Park stop details', exact: true });
  await expect(unknownPanel).toContainText('price unconfirmed · $50 planning allowance');
  await expect(unknownPanel).not.toContainText('~$35 entry');
  await unknownPanel.getByRole('link', { name: 'View Details', exact: true }).click();
  await expect(page.getByRole('definition').first()).toHaveText('price unconfirmed · $50 planning allowance');
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
  expect(current.plan.stops.map(s => s.cost)).toEqual([0, 50]);
  expect(current.plan.cost).toBe(50);
});

test('suggestion cards and map previews do not present unknown prices as entry fees', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'google', recommendations: 'planner' } }));
  await page.route('**/api/venues', route => route.fulfill({ json: { venues } }));
  await page.addInitScript(() => {
    const bundle = JSON.parse(localStorage.getItem('melloway.current'));
    bundle.plan.prefs.notes = 'I want a skate park';
    bundle.plan.stops = [{ ...bundle.plan.stops[0], id: 'fixture-existing', name: 'Fixture Existing Park' }];
    localStorage.setItem('melloway.current', JSON.stringify(bundle));
  });
  await page.goto('/explore');
  await page.getByRole('button', { name: 'show suggestions', exact: true }).click();
  const map = page.locator('.suggestion-map');
  const publicPin = map.getByRole('button', { name: 'show suggested spot Fixture Public Skate Park', exact: true });
  await expect(publicPin).toHaveText('free');
  await map.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await publicPin.focus();
  await expect(map.getByRole('complementary', { name: 'Place preview' })).toContainText('free entry · $0');
  await page.keyboard.press('Escape');
  const privatePin = map.getByRole('button', { name: 'show suggested spot Fixture Private Skate Park', exact: true });
  await expect(privatePin).toHaveText('check price');
  await privatePin.focus();
  await expect(map.getByRole('complementary', { name: 'Place preview' })).toContainText('price unconfirmed · $35 planning allowance');
  const feed = page.getByRole('list', { name: 'Nearby spot suggestions' });
  await expect(feed.locator('[data-venue-id="fixture-public"]')).toContainText('free entry · $0');
  await expect(feed.locator('[data-venue-id="fixture-private"]')).toContainText('price unconfirmed · $35 planning allowance');
});

test('older saved free stops show admission separately from previously reserved money', async ({ page }) => {
  await page.addInitScript(() => {
    const bundle = JSON.parse(localStorage.getItem('melloway.current'));
    bundle.plan.stops[0].cost = 35;
    bundle.plan.stops[0].estimatedCost = 0;
    localStorage.setItem('melloway.current', JSON.stringify(bundle));
  });
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'view Fixture Public Skate Park details', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Fixture Public Skate Park stop details', exact: true });
  await expect(panel).toContainText('free entry · $0');
  await expect(panel).toContainText('$35 reserved budget · entry is free');
  await expect(panel).not.toContainText('~$35 each');
});
