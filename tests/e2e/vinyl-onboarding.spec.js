import { test, expect } from '@playwright/test';
import { mockMapTiles } from './fixtures.js';
import { createGoogleProvider } from '../../server/google.js';
import { demoMatrix } from '../../src/utils/planner.js';

const sentence = 'i want to also go to a vinyl store';
// Synthetic retailer/Places facts; never call a live provider in browser tests.
const record = { id: 'fixture-records', displayName: { text: 'Fixture Rare Records' },
  formattedAddress: '12 Fixture Street, Sydney NSW 2000', types: ['store'],
  location: { latitude: -33.873, longitude: 151.207 }, businessStatus: 'OPERATIONAL',
  regularOpeningHours: { periods: [{ open: { day: 0, hour: 9 }, close: { day: 0, hour: 18 } }] },
  priceLevel: 'PRICE_LEVEL_INEXPENSIVE' };

for (const state of ['available', 'closed', 'not found']) test(`last onboarding screen honours a vinyl request (${state})`, async ({ page }) => {
  await mockMapTiles(page);
  const queries = [];
  const provider = createGoogleProvider('mock-only-key', async (_url, options) => {
    const body = JSON.parse(options.body);
    queries.push(body.textQuery);
    return Response.json({ places: body.textQuery.startsWith('record store near') && state !== 'not found'
      ? [{ ...record, ...(state === 'closed' ? { businessStatus: 'CLOSED_TEMPORARILY' } : {}) }] : [] });
  });
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'google', recommendations: 'planner' } }));
  let submitted;
  await page.route('**/api/venues', async route => {
    submitted = route.request().postDataJSON().prefs;
    return route.fulfill({ json: await provider.discoverWithDebug(submitted) });
  });
  await page.route('**/api/matrix', route => {
    const { venues, prefs } = route.request().postDataJSON();
    return route.fulfill({ json: { matrix: demoMatrix(venues, prefs.transport) } });
  });
  await page.addInitScript(() => localStorage.setItem('melloway.draft', JSON.stringify({
    date: '2026-10-18', duration: 5, transport: 'Walking', preferences: ['Coffee shops', 'Bookshops'],
  })));
  await page.goto('/plan/notes');
  await page.getByLabel('anything else for ur plan?').fill(sentence);
  await page.getByRole('button', { name: 'submit', exact: true }).click();
  if (state === 'available') {
    await expect(page).toHaveURL(/\/itinerary$/);
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
    expect(current.plan.stops.some(stop => stop.id === record.id && stop.activityRole === 'shop')).toBe(true);
    expect(current.plan.stops.some(stop => stop.activityRole === 'cafe')).toBe(true);
    expect(current.plan.elapsed).toBeLessThan(300);
    expect(current.plan.cost).toBeLessThanOrEqual(current.plan.prefs.budget);
  } else {
    await expect(page.getByText(state === 'closed'
      ? /requested record store could not be included: closed/
      : /did not return a verified record retailer/)).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toBeNull();
  }
  expect(submitted.notes).toBe(sentence);
  expect(submitted.duration).toBe(5);
  expect(queries.filter(query => query.startsWith('record store near'))).toEqual(['record store near Sydney CBD, Sydney Australia']);
});
