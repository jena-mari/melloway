import { test, expect } from '@playwright/test';
import { mockMapTiles } from './fixtures.js';
import { defaultDraft } from '../../src/data/preferences.js';
import { demoMatrix, editRoute } from '../../src/utils/planner.js';

function routeFixture() {
  const prefs = { ...defaultDraft(), date: '2020-01-01', notes: 'private dietary note', name: 'Jena' };
  const candidates = ['a', 'b', 'c'].map((id, i) => ({ id, name: `Venue ${id}`, category: 'Café',
    tags: ['Coffee shops'], lat: -33.88 + i * .001, lng: 151.2, cost: 10, mins: 30,
    address: 'Sydney', source: 'demo', hours: { open: 0, close: 1440 } }));
  const matrix = demoMatrix(candidates, prefs.transport);
  return { candidates, matrix, plan: { ...editRoute(candidates, prefs, candidates, matrix),
    prefs, id: 'original', status: 'upcoming' } };
}
async function start(page) {
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'start ur day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'finish date', exact: true })).toBeVisible();
}
async function finish(page) {
  await start(page);
  await page.getByRole('button', { name: 'finish date', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog', { name: /date complete/ })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.addInitScript(route => {
    if (!localStorage.getItem('history-test-seeded')) {
      localStorage.setItem('melloway.current', JSON.stringify(route));
      localStorage.setItem('history-test-seeded', 'yes');
    }
  }, routeFixture());
});

test('in-progress resumes; finishing and dismissing clears Home across reloads', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: 'make a plan', exact: true }).click();
  await expect(page.getByRole('link', { name: 'continue ur day' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'continue ur day' }).click();
  await expect(page.getByRole('button', { name: 'finish date', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'finish date', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /date complete/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'continue ur day' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: 'ur day', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'past dates' }).click();
  await expect(page.locator('.history-list article')).toHaveCount(1);
  await page.locator('.history-route-link').click();
  await expect(page.locator('.route-summary-list > li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'edit', exact: true })).toHaveCount(0);
  await page.goto('/itinerary');
  await expect(page.getByRole('heading', { name: 'ur next good day is waiting.' })).toBeVisible();
});

test('private ratings persist; favourites open history; sharing requires a separate Post', async ({ page }) => {
  await finish(page);
  await page.getByRole('button', { name: 'rate this date', exact: true }).click();
  await page.getByRole('radio', { name: '4 stars', exact: true }).check();
  await page.getByLabel('a little review · optional').fill('a lovely afternoon');
  await page.getByText('rate the spots · optional', { exact: true }).click();
  await page.getByLabel('Your rating for Venue b').selectOption('5');
  await page.getByRole('button', { name: 'save privately', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('melloway.posts'))).toBeNull();
  await page.getByRole('link', { name: 'past dates' }).click();
  await page.locator('.history-route-link').click();
  await page.reload();
  await expect(page.getByLabel('Your private review')).toContainText('a lovely afternoon');
  await expect(page.getByLabel('4 out of 5 stars')).toBeVisible();
  await page.getByRole('button', { name: 'save route', exact: true }).click();
  await page.goto('/favourites');
  await page.getByRole('button', { name: 'open plan', exact: true }).click();
  await expect(page).toHaveURL(/\/history\/original$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toBeNull();
  await page.getByRole('button', { name: 'edit review', exact: true }).click();
  await expect(page.getByLabel('Your rating for Venue b')).toHaveValue('5');
  await page.getByRole('button', { name: 'share with community', exact: true }).click();
  await expect(page.getByLabel('post', { exact: true })).toHaveValue('a lovely afternoon');
  expect(await page.evaluate(() => localStorage.getItem('melloway.posts'))).toBeNull();
  await page.getByRole('button', { name: 'save to device feed', exact: true }).click();
  const [post] = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.posts')));
  expect(post.description).toBe('a lovely afternoon');
  expect(post.rating).toBe(4);
  expect(post.plan.review).toBeUndefined();
  expect(post.plan.prefs.notes).toBeUndefined();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.history'))[0].review.stopRatings)).toEqual({ b: 5 });
});

test('redo creates a separately editable copy without changing the completed snapshot', async ({ page }) => {
  await finish(page);
  const original = await page.evaluate(() => localStorage.getItem('melloway.history'));
  await page.getByRole('button', { name: 'redo this route', exact: true }).click();
  await page.getByLabel('start time', { exact: true }).fill('12:00');
  await page.getByRole('button', { name: 'customise stops', exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.locator('.route-summary-list')).toHaveClass(/editing/);
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
  expect(current.plan.id).not.toBe('original');
  expect(current.plan.status).toBe('upcoming');
  expect(current.plan.stops[0].arrival).toBe(720);
  await page.getByRole('button', { name: 'remove Venue c from route', exact: true }).click();
  await expect(page.locator('.route-summary-list > li')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('melloway.history'))).toBe(original);
  await page.getByRole('button', { name: 'done', exact: true }).click();
  await page.getByRole('button', { name: 'start ur day', exact: true }).click();
  await page.getByRole('button', { name: 'finish date', exact: true }).click();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.history')));
  expect(history).toHaveLength(2);
  expect(history.find(r => r.id === 'original')).toEqual(JSON.parse(original)[0]);
  expect(history[0].plan.stops).toHaveLength(2);
});

test('history storage failure keeps the in-progress route accessible', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'melloway.history') throw new DOMException('Full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'finish date', exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.getByRole('status')).toContainText('Couldn’t save your past date');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.status)).toBe('in-progress');
  await page.reload();
  await expect(page.getByRole('button', { name: 'finish date', exact: true })).toBeVisible();
});

test('completion sheet fits small phones and can close without a rating', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finish(page);
  const sheet = page.getByRole('dialog', { name: /date complete/ });
  const box = await sheet.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  await page.screenshot({ path: '/private/tmp/melloway-completion-sheet.png' });
  await page.getByRole('button', { name: 'back to home', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.history'))[0].review.rating)).toBeNull();
  await page.screenshot({ path: '/private/tmp/melloway-completed-home.png' });
});

test('opening a saved current route preserves its started state', async ({ page }) => {
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'lock this in', exact: true }).click();
  await page.getByRole('button', { name: 'start ur day', exact: true }).click();
  const startedAt = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.startedAt);
  await page.goto('/favourites');
  await page.getByRole('button', { name: 'open plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'finish date', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.startedAt)).toBe(startedAt);
});

test('a failed current-key clear cannot resurrect an archived route on reload', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'melloway.current') throw new DOMException('Full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'finish date', exact: true }).click();
  await page.getByRole('button', { name: 'dismiss date completion', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.status)).toBe('in-progress');
  await page.reload();
  await expect(page.getByRole('link', { name: 'continue ur day' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.history')).length)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toBeNull();
});

test('failed private review writes stay visible and do not publish or pretend to save', async ({ page }) => {
  await finish(page);
  await page.getByRole('button', { name: 'rate this date', exact: true }).click();
  await page.getByRole('radio', { name: '3 stars', exact: true }).check();
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'melloway.history') throw new DOMException('Full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'save privately', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Your review wasn’t saved');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.history'))[0].review.rating)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('melloway.posts'))).toBeNull();
});

test('failed legacy migration leaves the completed record recoverable and off Home', async ({ page }) => {
  await page.addInitScript(() => {
    const route = JSON.parse(localStorage.getItem('melloway.current'));
    route.plan.status = 'completed';
    route.plan.completedAt = '2026-10-11T04:00:00Z';
    localStorage.setItem('melloway.current', JSON.stringify(route));
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'melloway.history') throw new DOMException('Full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'ur upcoming day' })).toHaveCount(0);
  await page.getByRole('link', { name: 'past dates' }).click();
  await expect(page.locator('.history-list article')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.status)).toBe('completed');
  await page.reload();
  await expect(page.locator('.history-list article')).toHaveCount(1);
});

test('completed bookmarks can open history without replacing a different active day', async ({ page }) => {
  await page.addInitScript(() => {
    const route = JSON.parse(localStorage.getItem('melloway.current'));
    const completed = { ...route.plan, status: 'completed', completedAt: '2026-10-11T04:00:00Z' };
    localStorage.setItem('melloway.saved', JSON.stringify([completed]));
    route.plan.id = 'another-active-day';
    localStorage.setItem('melloway.current', JSON.stringify(route));
  });
  await page.goto('/favourites');
  await page.getByRole('button', { name: 'open plan', exact: true }).click();
  await expect(page).toHaveURL(/\/history\/original$/);
  await expect(page.locator('.route-summary-list > li')).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.id)).toBe('another-active-day');
  await page.getByRole('button', { name: 'redo route', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'redo route', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'dismiss date completion' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan.id)).toBe('another-active-day');
});
