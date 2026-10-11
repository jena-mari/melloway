import { test, expect } from '@playwright/test';
import { defaultDraft } from '../../src/data/preferences.js';
import { demoMatrix, editRoute } from '../../src/utils/planner.js';
import { mockMapTiles } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const prefs = { ...defaultDraft(), area: 'Sydney CBD', date: '2026-10-12', transport: 'Walking' };
const candidates = ['a', 'b', 'c'].map((id, i) => ({ id, name: `Test café ${id}`, category: 'Café', tags: ['Coffee shops'],
  lat: -33.88 + i * .001, lng: 151.2, cost: 10, mins: 30, address: 'Sydney', source: 'demo', hours: { open: 0, close: 1440 } }));
const matrix = demoMatrix(candidates, prefs.transport);
const fixture = { candidates, matrix, plan: { ...editRoute(candidates, prefs, candidates, matrix), prefs, id: 'name-fixture', status: 'upcoming' } };
const current = page => page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('melloway.saved')));
async function editor(page) {
  await page.getByRole('button', { name: 'rename date', exact: true }).click();
  return page.getByRole('dialog', { name: 'rename ur date', exact: true });
}
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.addInitScript(route => {
    if (!localStorage.getItem('name-test-seeded')) {
      localStorage.setItem('name-test-seeded', '1');
      localStorage.setItem('melloway.current', JSON.stringify(route));
    }
  }, fixture);
});

test('rename preserves the itinerary, stays after reload, and does not auto-bookmark or refetch routes', async ({ page }) => {
  let routeRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/itinerary-routes')) routeRequests++; });
  await page.goto('/itinerary');
  await expect(page.locator('.google-map-canvas').first()).toHaveAttribute('data-map-state', 'ready');
  const before = await current(page), requestsBefore = routeRequests;
  const dialog = await editor(page);
  await expect(dialog.getByLabel('date name')).toBeFocused();
  await dialog.getByLabel('date name').fill('  Café & matcha 💚   afternoon  ');
  await dialog.getByLabel('date name').press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Café & matcha 💚 afternoon', exact: true })).toBeVisible();
  const after = await current(page);
  const { title, titleUpdatedAt, ...unchanged } = after.plan;
  expect(unchanged).toEqual(before.plan);
  expect(await saved(page)).toEqual([]);
  expect(routeRequests).toBe(requestsBefore);
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('renaming a saved in-progress date persists after clearing current and reopening favourites', async ({ page }) => {
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'lock this in', exact: true }).click();
  await page.getByRole('button', { name: 'start ur day', exact: true }).click();
  const before = await current(page);
  const dialog = await editor(page);
  await dialog.getByLabel('date name').fill('Our first Sydney date');
  await dialog.getByRole('button', { name: 'save name', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await current(page)).plan.startedAt).toBe(before.plan.startedAt);
  expect((await current(page)).plan.status).toBe('in-progress');
  expect(await saved(page)).toHaveLength(1);
  expect((await saved(page))[0].title).toBe('Our first Sydney date');
  await page.evaluate(() => localStorage.removeItem('melloway.current'));
  await page.goto('/favourites');
  await expect(page.getByRole('heading', { name: 'Our first Sydney date', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'open plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Our first Sydney date', exact: true })).toBeVisible();
  expect((await current(page)).plan.id).toBe(before.plan.id);
});

test('empty names and cancelling leave the existing name untouched', async ({ page }) => {
  await page.goto('/itinerary');
  const before = await current(page);
  let dialog = await editor(page);
  await dialog.getByLabel('date name').fill('   ');
  await dialog.getByRole('button', { name: 'save name', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Give your day a name');
  expect(await current(page)).toEqual(before);
  await dialog.getByLabel('date name').fill('Not saved');
  await dialog.getByRole('button', { name: 'cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  dialog = await editor(page);
  await expect(dialog.getByLabel('date name')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(await current(page)).toEqual(before);
});

for (const key of ['melloway.current', 'melloway.saved']) {
  test(`a ${key} storage failure reports the error and preserves the saved name`, async ({ page }) => {
    await page.goto('/itinerary');
    await page.getByRole('button', { name: 'lock this in', exact: true }).click();
    const before = await current(page), bookmark = await saved(page);
    await page.evaluate(key => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('Full', 'QuotaExceededError');
        return write.call(this, name, value);
      };
    }, key);
    const dialog = await editor(page);
    await dialog.getByLabel('date name').fill('Storage failure');
    await dialog.getByRole('button', { name: 'save name', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('wasn’t saved');
    expect(await current(page)).toEqual(before);
    expect(await saved(page)).toEqual(bookmark);
  });
}

test('a long name fits small screens and follows the date into history', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/itinerary');
  const dialog = await editor(page);
  const name = 'Our Sydney afternoon — coffee, bookshops, gardens and a little adventure';
  await dialog.getByLabel('date name').fill(name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.screenshot({ path: info.outputPath('rename-date.png') });
  await dialog.getByRole('button', { name: 'save name', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'start ur day', exact: true }).click();
  await page.getByRole('button', { name: 'finish date', exact: true }).click();
  await page.getByRole('button', { name: 'dismiss date completion', exact: true }).click();
  await page.goto('/history/name-fixture');
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.history'))[0].plan.title)).toBe(name);
  await expect(page.getByRole('button', { name: 'rename date', exact: true })).toHaveCount(0);
});
