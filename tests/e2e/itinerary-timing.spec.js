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
  const bundle = fixture({ transport: 'Public transport' });
  expect(bundle.plan.elapsed).toBe(200);
  await seed(page, bundle);
  await expect(overview(page)).toContainText('Sun, 18 Oct 2026');
  await expect(overview(page).locator('time')).toHaveAttribute('datetime', '2026-10-18');
  await expect(overview(page)).toContainText('2:00 pm start');
  await expect(overview(page)).not.toContainText('Sydney time');
  await expect(overview(page)).toContainText('~3h 20m / 5h available');
  await expect(overview(page).locator('p').nth(1)).toHaveText('~3h 20m / 5h available · Public transport · 35 min · estimated');
  await expect(overview(page).locator('strong')).toHaveText(['~3h 20m / 5h available', `~$${bundle.plan.cost} / $100 each`]);
  await expect(page.locator('.route-summary-meta')).not.toContainText('35 min · estimated');
  await expect(page.locator('.route-summary-total')).toContainText(`~$${bundle.plan.cost} / $100 each`);
  await expect(overview(page)).not.toContainText('estimated, including travel and waiting');
  await expect(page.locator('.route-summary-time').first()).toHaveText('2:00 pm–2:30 pm');
  await expect(page.locator('.route-leg-timing')).toHaveText(['A → B · ~15m on public transport', 'B → C · ~20m on public transport · 1h 15m wait']);
  await expect(page.locator('.route-stop-box .route-leg-timing')).toHaveCount(0);
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
  expect((await storedPlan(page)).stops).toEqual(bundle.plan.stops);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (let index = 0; index < 2; index++) {
      const previous = await page.locator('.route-stop-box').nth(index).boundingBox();
      const travel = await page.locator('.route-leg-timing').nth(index).boundingBox();
      const next = await page.locator('.route-stop-box').nth(index + 1).boundingBox();
      expect(travel.y).toBeGreaterThanOrEqual(previous.y + previous.height);
      expect(travel.y + travel.height).toBeLessThanOrEqual(next.y);
      expect(travel.x).toBe(previous.x);
    }
    await page.locator('.route-summary').screenshot({ path: info.outputPath(`day-timing-${width}.png`) });
    await page.locator('.route-summary-heading').screenshot({ path: info.outputPath(`time-and-budget-${width}.png`) });
  }
  await page.locator('.route-summary-total').screenshot({ path: info.outputPath('cost-against-budget.png') });
  await page.getByRole('button', { name: 'lock this in', exact: true }).click();
  await page.reload();
  await expect(overview(page)).toContainText('~3h 20m / 5h available');
  await expect(overview(page)).toContainText('Sun, 18 Oct 2026');
  await expect(overview(page)).toContainText('available · Public transport · 35 min · estimated');
  expect((await storedPlan(page)).stops).toEqual(bundle.plan.stops);
});

test('editing a timeframe updates visible times and duration without changing the selected date or hours', async ({ page }) => {
  await seed(page, fixture());
  const time = page.getByRole('button', { name: 'edit Test spot a timeframe', exact: true });
  await expect(time).toHaveText('2:00 pm–2:30 pm');
  await expect(time).toHaveCSS('text-decoration-line', 'underline');
  await time.focus();
  await time.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Test spot a', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
  await dialog.getByLabel('arrive at', { exact: true }).fill('15:00');
  await dialog.getByLabel('visit length in minutes', { exact: true }).fill('60');
  await dialog.getByRole('button', { name: 'save timeframe', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(overview(page)).toContainText('~3h 35m / 5h available');
  await expect(overview(page)).toContainText('Sun, 18 Oct 2026');
  await expect(page.locator('.route-summary-time').first()).toHaveText('3:00 pm–4:00 pm');
  await expect(page.locator('.route-leg-timing')).toHaveText(['A → B · ~15m walk', 'B → C · ~20m walk']);
});

test('unset modes remain travel buffers and missing legs do not become zero-minute travel', async ({ page }) => {
  const bundle = fixture({ transport: 'Not selected' });
  delete bundle.plan.stops[1].travelFromPrevious;
  await seed(page, bundle);
  await expect(overview(page)).toContainText('available · Travel mode not selected · planning buffer · 35 min · estimated');
  await expect(page.locator('.route-leg-timing')).toHaveText(['A → B · 15m between stops · travel estimate unavailable', 'B → C · ~20m travel buffer · 1h 15m wait']);
});

test('late outings keep the chosen calendar date and mark stop times after midnight', async ({ page }) => {
  await seed(page, fixture({ date: '2026-07-12', time: '23:30' }, true));
  await expect(overview(page)).toContainText('Sun, 12 July 2026');
  await expect(overview(page)).toContainText('11:30 pm start');
  await expect(overview(page)).toContainText('~2h 5m / 5h available');
  await expect(page.locator('.route-summary-time').first()).toHaveText('11:30 pm–12:00 am (+1 day)');
  await expect(page.locator('.route-summary-time').nth(1)).toContainText('12:15 am (+1 day)');
});

test('travel labels follow reordered places and do not join stops hidden by search', async ({ page }) => {
  const bundle = fixture();
  await seed(page, bundle);
  await page.getByRole('button', { name: 'shuffle route', exact: true }).click();
  await expect.poll(async () => (await storedPlan(page)).stops.map(stop => stop.id)).not.toEqual(bundle.plan.stops.map(stop => stop.id));
  const changed = await storedPlan(page);
  for (let index = 0; index < changed.stops.length - 1; index++) {
    const label = page.getByRole('group', { name: `Travel from ${changed.stops[index].name} to ${changed.stops[index + 1].name}`, exact: true });
    await expect(label).toContainText(`${String.fromCharCode(65 + index)} → ${String.fromCharCode(66 + index)}`);
  }
  await page.getByRole('button', { name: 'Search stops', exact: true }).click();
  await page.getByRole('searchbox', { name: 'search ur stops', exact: true }).fill('Test spot b');
  await expect(page.locator('.route-stop-box')).toHaveCount(1);
  await expect(page.locator('.route-leg-timing')).toHaveCount(0);
  await page.getByRole('button', { name: 'clear search', exact: true }).click();
  await expect(page.locator('.route-stop-box')).toHaveCount(3);
  await expect(page.locator('.route-leg-timing')).toHaveCount(2);
});
