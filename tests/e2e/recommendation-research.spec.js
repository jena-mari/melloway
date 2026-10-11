import { test, expect } from '@playwright/test';
import { mockMapTiles } from './fixtures.js';
import { curatedVenuesForDate } from '../../src/data/sydneyVenues.js';
import { defaultDraft } from '../../src/data/preferences.js';
import { interpretPreferences } from '../../src/engine/preferences.js';
import { demoMatrix } from '../../src/utils/planner.js';
const prefs = { ...defaultDraft(), date: '2026-10-18', area: 'Surry Hills', preferences: ['Coffee shops'], budget: 100 };
const original = curatedVenuesForDate(prefs.date).find(v => v.name === 'Reuben Hills');
const venue = { ...original, id: 'source-discovered-cafe', name: 'Source Café', source: 'google', address: '2 Test Street, Surry Hills NSW 2010' };
const source = 'https://www.russh.com/best-cafes-sydney/';
const social = 'https://www.instagram.com/reel/IndexedSource123/';
const leads = [{ name: venue.name, locality: 'Surry Hills', tags: ['Coffee shops'], evidence: [
  { url: source, summary: 'Independent café selection.', sentiment: 'positive', origin: 'independent' },
  { url: social, summary: 'Visitor café video.', sentiment: 'positive', origin: 'independent' },
] }];

test.beforeEach(async ({ page }) => {
  await mockMapTiles(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://www.instagram.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Offline social embed</p>' }));
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'curated', recommendations: 'openai' } }));
  await page.route('**/api/intent', route => route.fulfill({ json: { intent: interpretPreferences(route.request().postDataJSON().prefs) } }));
  await page.route('**/api/matrix', route => { const { venues, prefs } = route.request().postDataJSON(); return route.fulfill({ json: { matrix: demoMatrix(venues, prefs.transport) } }); });
  await page.route('**/api/recommendations', route => route.fulfill({ json: { rankings: route.request().postDataJSON().venues.map(v => ({ venueId: v.id, fit: v.id === venue.id ? 10 : 0, exclude: false })) } }));
  await page.addInitScript(value => localStorage.setItem('melloway.draft', JSON.stringify(value)), prefs);
});

test('new web-sourced venues reach generation and reveal their real source links without crowding the page', async ({ page }) => {
  let ranked;
  await page.route('**/api/discovery', route => route.fulfill({ json: { leads, venues: [venue], researchStatus: 'web' } }));
  await page.route('**/api/recommendations', route => {
    ranked = route.request().postDataJSON().venues;
    return route.fulfill({ json: { rankings: ranked.map(v => ({ venueId: v.id, fit: v.id === venue.id ? 10 : 0, exclude: false })) } });
  });
  await page.goto('/plan/notes');
  await page.getByRole('button', { name: 'submit', exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  expect(ranked.find(v => v.id === venue.id).recommendationEvidence.map(item => item.url)).toEqual([source, social]);
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
  expect(current.plan.discoverySource).toBe('web');
  expect(current.plan.cost).toBeLessThanOrEqual(prefs.budget);
  await page.getByRole('link', { name: 'explore', exact: true }).click();
  await expect(page.locator('.suggestion-feed')).toBeVisible();
  await page.getByRole('button', { name: 'preview Reuben Hills', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const disclosure = dialog.locator('details').filter({ hasText: 'why this spot' });
  await expect(disclosure).not.toHaveAttribute('open', '');
  await disclosure.locator('summary').click();
  await expect(disclosure.getByRole('link', { name: 'russh.com ↗' })).toHaveAttribute('href', source);
});

test('Explore without an itinerary discovers source-backed spots and maintains the existing planning flow', async ({ page }) => {
  await page.route('**/api/discovery', route => route.fulfill({ json: { leads, venues: [venue], researchStatus: 'web' } }));
  await page.goto('/explore');
  await page.getByRole('button', { name: `preview ${venue.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Visitor café video.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'plan around this', exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/profile$/);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.draft')));
  expect(draft.notes).toContain(venue.name);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toBeNull();
});
