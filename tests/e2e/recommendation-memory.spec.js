import { test, expect } from '@playwright/test';
import { mockMapTiles } from './fixtures.js';
import { recommendationVenuesForDate } from '../../src/data/recommendationCatalog.js';

test('five new planning flows remember venue identities across reloads and honour an explicit repeat', async ({ page }) => {
  await mockMapTiles(page);
  const kino = recommendationVenuesForDate('2026-10-17').find(venue => venue.id === 'sydney-kinokuniya');
  // Synthetic provider alternatives: no claims about actual businesses or hours.
  const venues = Array.from({ length: 5 }, (_, i) => ({ ...kino, id: `fixture-memory-${i}`,
    name: `Fixture bookshop ${i + 1}`, address: `${i + 1} Fixture Street, Sydney NSW 2000`,
    source: 'google', providerTypes: ['book_store'], description: 'Synthetic test fixture.',
    sources: [], website: 'https://example.com/fixture',
  }));
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'google', recommendations: 'planner' } }));
  await page.route('**/api/venues', route => route.fulfill({ json: { venues } }));
  await page.addInitScript(() => {
    if (!localStorage.getItem('melloway.draft')) localStorage.setItem('melloway.draft', JSON.stringify({
      date: '2026-10-17', transport: 'Walking', preferences: ['Bookshops'],
    }));
  });
  const books = [];
  for (let i = 0; i < 5; i++) {
    await page.goto('/plan/notes');
    await page.getByLabel('anything else for ur plan?').fill('bookshops');
    await page.getByRole('button', { name: 'submit', exact: true }).click();
    await expect(page).toHaveURL(/\/itinerary$/);
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
    books.push(current.plan.stops.find(venue => venue.activityRole === 'bookshop').name);
    expect(current.plan.cost).toBeLessThanOrEqual(current.plan.prefs.budget);
    expect(current.plan.elapsed).toBeLessThanOrEqual(current.plan.prefs.duration * 60);
    await page.reload();
  }
  expect(books[0]).toBe(kino.name);
  expect(new Set(books).size).toBe(5);
  expect(books.filter(name => name === kino.name)).toHaveLength(1);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.recentRecommendations.v1')));
  expect(history).toHaveLength(5);
  await page.goto('/plan/notes');
  await page.getByLabel('anything else for ur plan?').fill('I want Kinokuniya');
  await page.getByRole('button', { name: 'submit', exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  const explicit = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
  expect(explicit.plan.stops.some(venue => venue.id === kino.id)).toBe(true);
});
