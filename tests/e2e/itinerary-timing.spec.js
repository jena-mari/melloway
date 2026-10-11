import { test, expect } from '@playwright/test';
import { defaultDraft } from '../../src/data/preferences.js';
import { editRoute } from '../../src/utils/planner.js';
import { mockMapTiles } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });

function fixture(overrides = {}, overnight = false) {
  const prefs = { ...defaultDraft(), area: 'Sydney CBD', date: '2026-10-18', time: '14:00', transport: 'Walking', duration: 5, budget: 100, ...overrides };
  const candidates = ['a', 'b', 'c'].map((id, index) => ({ id: `timing-${id}`, name: `Test spot ${id}`, address: 'Sydney test address',
    score: 10, source: 'curated', area: 'Sydney CBD', lat: -33.87 - index * .001, lng: 151.208 + index * .001,
    tags: ['Bookshops'], category: 'Bookshops', hours: { open: index === 2 && !overnight ? 1010 : 0, close: 1440 }, cost: 10, mins: 30 }));
  const matrix = [[0,15,20],[15,0,20],[20,20,0]].map(row => row.map(minutes => ({ minutes, distance: .1, source: 'estimate' })));
  const plan = { ...editRoute(candidates, prefs, candidates, matrix), prefs, id: 'timing-fixture', notice: 'Offline timing fixture.' };
  return { plan, candidates, matrix };
}
async function seed(page, bundle) {
  await mockMapTiles(page);
  await page.addInitScript(bundle => {
    if (!sessionStorage.getItem('timing-ready')) {
      sessionStorage.setItem('timing-ready', '1');
      localStorage.setItem('melloway.current', JSON.stringify(bundle));
    }
  }, bundle);
  await page.goto('/itinerary');
}
const overview = page => page.getByLabel('Your day timing', { exact: true });
const storedPlan = page => page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan);

test('selected date, visit times, incoming travel and used / available hours stay visible after refresh', async ({ page }, info) => {
  const bundle = fixture();
  expect(bundle.plan.elapsed).toBe(200);
  await seed(page, bundle);
  await expect(overview(page)).toContainText('Sun, 18 Oct 2026');
  await expect(overview(page).locator('time')).toHaveAttribute('datetime', '2026-10-18');
  await expect(overview(page)).toContainText('2:00 pm start · Sydney time');
  await expect(overview(page)).toContainText('~3h 20m / 5h available');
  await expect(overview(page)).toContainText('including travel and waiting');
  await expect(page.locator('.route-summary-spot small').first()).toHaveText('2:00 pm–2:30 pm');
  await expect(page.locator('.route-leg-timing')).toHaveText(['~15m walk', '~20m walk · 1h 15m wait']);
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
  expect((await storedPlan(page)).stops).toEqual(bundle.plan.stops);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.route-summary').screenshot({ path: info.outputPath(`day-timing-${width}.png`) });
  }
  await page.getByRole('button', { name: 'lock this in', exact: true }).click();
  await page.reload();
  await expect(overview(page)).toContainText('~3h 20m / 5h available');
  await expect(overview(page)).toContainText('Sun, 18 Oct 2026');
  expect((await storedPlan(page)).stops).toEqual(bundle.plan.stops);
});

test('editing a timeframe updates visible times and duration without changing the selected date or hours', async ({ page }) => {
  await seed(page, fixture());
  await page.getByRole('button', { name: 'edit Test spot a timeframe', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Test spot a', exact: true });
  await dialog.getByLabel('arrive at', { exact: true }).fill('15:00');
  await dialog.getByLabel('visit length in minutes', { exact: true }).fill('60');
  await dialog.getByRole('button', { name: 'save timeframe', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(overview(page)).toContainText('~3h 35m / 5h available');
  await expect(overview(page)).toContainText('Sun, 18 Oct 2026');
  await expect(page.locator('.route-summary-spot').first()).toContainText('3:00 pm–4:00 pm');
  await expect(page.locator('.route-leg-timing')).toHaveText(['~15m walk', '~20m walk']);
});

test('unset modes remain travel buffers and missing legs do not become zero-minute travel', async ({ page }) => {
  const bundle = fixture({ transport: 'Not selected' });
  delete bundle.plan.stops[1].travelFromPrevious;
  await seed(page, bundle);
  await expect(page.locator('.route-leg-timing')).toHaveText(['15m between stops · travel estimate unavailable', '~20m travel buffer · 1h 15m wait']);
});

test('late outings keep the chosen calendar date and mark stop times after midnight', async ({ page }) => {
  await seed(page, fixture({ date: '2026-07-12', time: '23:30' }, true));
  await expect(overview(page)).toContainText('Sun, 12 July 2026');
  await expect(overview(page)).toContainText('11:30 pm start · Sydney time');
  await expect(overview(page)).toContainText('~2h 5m / 5h available');
  await expect(page.locator('.route-summary-spot').first()).toContainText('11:30 pm–12:00 am (+1 day)');
  await expect(page.locator('.route-summary-spot').nth(1)).toContainText('12:15 am (+1 day)');
});
