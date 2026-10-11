import { test, expect } from '@playwright/test';

// Private local fixture. navigator.share is always mocked: nothing is actually sent.
const prefs = { mode: 'date', name: 'PRIVATE_NAME', age: 9876, gender: 'PRIVATE_GENDER',
  companion: 'PRIVATE_COMPANION', partner: 'PRIVATE_PARTNER', area: 'Sydney CBD', budget: 80,
  date: '2026-10-12', time: '11:00', transport: 'Walking', duration: 5, preferences: [],
  notes: 'PRIVATE_NOTES', startingAddress: 'PRIVATE_START_ADDRESS' };
const stops = ['Fixture café', 'Fixture gallery'].map((name, index) => ({
  id: `fixture-stop-${index}`, name, arrival: 660 + index * 90, lat: -33.86 - index * 0.01, lng: 151.21,
  area: 'Sydney CBD', address: 'Fixture public venue address', cost: 20, mins: 60, tags: [], category: 'Café',
  source: 'demo', note: 'PRIVATE_STOP_NOTE', travelFromPrevious: null,
}));
const plan = { id: 'fixture-share-plan', stops, prefs, cost: 40, transportAllowance: 0, travel: 30,
  elapsed: 150, distance: 1, source: 'estimate', notice: 'PRIVATE_NOTICE', createdAt: '2026-10-11T00:00:00Z' };
const stored = { state: { draft: prefs, current: { plan, candidates: [], matrix: [], notice: plan.notice }, saved: [plan] }, version: 1 };

async function mockSharing(page, mode) {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(({ stored, mode }) => {
    localStorage.setItem('melloway.mobile.v1', JSON.stringify(stored));
    window.__sharePayloads = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: content => {
      window.__sharePayloads.push(content);
      if (mode === 'cancel') return Promise.reject(new DOMException('Mock cancelled', 'AbortError'));
      if (mode === 'failure' && window.__sharePayloads.length === 1) return Promise.reject(new Error('Mock unavailable'));
      if (mode === 'pending') return new Promise(resolve => { window.__finishShare = resolve; });
      return Promise.resolve();
    } });
  }, { stored, mode });
  await page.goto('/itinerary');
}

test('sharing happens only on press, contains allowed text and leaves saved plans unchanged', async ({ page }) => {
  await mockSharing(page, 'pending');
  const button = page.getByRole('button', { name: 'Share this plan', exact: true });
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.__sharePayloads.length)).toBe(0);
  const before = await page.evaluate(() => localStorage.getItem('melloway.mobile.v1'));
  await button.click();
  await expect(button).toBeDisabled();
  const payloads = await page.evaluate(() => window.__sharePayloads);
  expect(payloads).toHaveLength(1);
  expect(payloads[0].text).toContain('Melloway plan');
  expect(payloads[0].text).toContain('Outing date: 2026-10-12');
  expect(payloads[0].text).toContain('1. Fixture café — 11:00 am');
  expect(payloads[0].text).toContain('2. Fixture gallery — 12:30 pm');
  expect(payloads[0].text).toContain('Transport: Walking');
  expect(payloads[0].text).toContain('Estimated spending per person: ~$40.00 AUD');
  expect(payloads[0].text).toContain('Map: https://www.google.com/maps/search/?api=1&query=');
  expect(payloads[0].text).not.toMatch(/PRIVATE_|9876/);
  expect(payloads[0].url).toBeUndefined();
  expect(payloads[0].files).toBeUndefined();
  await page.evaluate(() => window.__finishShare());
  await expect(button).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('melloway.mobile.v1'))).toBe(before);
});

test('mock cancellation is quiet and keeps the itinerary available', async ({ page }) => {
  await mockSharing(page, 'cancel');
  const button = page.getByRole('button', { name: 'Share this plan', exact: true });
  await button.click();
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => window.__sharePayloads.length)).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'saved ♡', exact: true })).toBeVisible();
});

test('mock failure shows helpful feedback and a successful retry clears it', async ({ page }) => {
  await mockSharing(page, 'failure');
  const button = page.getByRole('button', { name: 'Share this plan', exact: true });
  await button.click();
  await expect(page.getByRole('alert')).toHaveText('Could not open sharing. Please try again on a device or browser that supports sharing.');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => window.__sharePayloads.length)).toBe(2);
  await expect(page.getByRole('button', { name: 'saved ♡', exact: true })).toBeVisible();
});

test('no itinerary means there is no share button or automatic share attempt', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'share', { value: () => { throw new Error('Unexpected share attempt'); } });
  });
  await page.goto('/itinerary');
  await expect(page.getByRole('button', { name: 'make a plan →', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share this plan', exact: true })).toHaveCount(0);
});
