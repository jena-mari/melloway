import { test, expect } from '@playwright/test';
import http from 'node:http';
import { createEventsHandler } from '../../server/events.ts';
import { mockMapTiles, mockLocationSearch, chooseArea, chooseTime, continueQuestions } from './fixtures.js';

// Synthetic Ticketmaster payloads pass through the real backend handler; no external providers.
function event(id, date = '2026-10-12', time = '12:00:00', min = 25, end) {
  return { id, name: `Mock ${id}`, url: `https://www.ticketmaster.com.au/event/${id}`,
    dates: { start: { localDate: date, localTime: time }, timezone: 'Australia/Sydney',
      ...(end ? { end: { dateTime: end } } : {}) },
    classifications: [{ segment: { name: 'Music' } }],
    priceRanges: min === null ? [] : [{ min, max: 80, currency: 'AUD' }],
    _embedded: { venues: [{ name: 'Mock Newtown venue', address: { line1: 'Mock street' },
      city: { name: 'Newtown' }, location: { latitude: '-33.8965', longitude: '151.1794' } }] } };
}

async function mockBackend(page, results) {
  const original = process.env.TICKETMASTER_API_KEY;
  process.env.TICKETMASTER_API_KEY = 'mock-key';
  const handler = createEventsHandler({ now: () => new Date('2026-10-11T00:00:00Z'),
    fetcher: async () => Response.json({ _embedded: { events: results } }) });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const requests = [];
  await page.route('**/api/events?**', async route => {
    const url = new URL(route.request().url()); requests.push(url);
    const response = await route.fetch({ url: `http://127.0.0.1:${server.address().port}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  return { requests, async close() {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (original === undefined) delete process.env.TICKETMASTER_API_KEY;
    else process.env.TICKETMASTER_API_KEY = original;
  } };
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T00:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockLocationSearch(page);
  await mockMapTiles(page);
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'curated', recommendations: 'planner' } }));
});

test('existing onboarding answers filter Ticketmaster events through the backend and survive reload', async ({ page }, info) => {
  const backend = await mockBackend(page, [event('affordable'), event('full-fit', undefined, undefined, 30, '2026-10-12T02:00:00Z'),
    event('expensive', undefined, undefined, 60), event('late', undefined, '20:00:00'),
    event('price-unknown', undefined, '12:30:00', null), event('next-day', '2026-10-13')]);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'start', exact: true }).click();
    await page.getByLabel('what’s ur name?').fill('Jena');
    await continueQuestions(page, 5);
    await chooseArea(page, 'Newtown');
    await continueQuestions(page);
    await page.getByLabel('budget each').fill('30');
    await page.getByRole('button', { name: /a few more details/ }).click();
    await continueQuestions(page);
    await page.getByRole('button', { name: 'tomorrow', exact: true }).click();
    await continueQuestions(page);
    await chooseTime(page, '11:00');
    await continueQuestions(page, 2);
    await page.getByLabel('how long have we got?').selectOption('3');
    await continueQuestions(page);
    await page.getByRole('button', { name: 'lemme skip this +', exact: true }).click();
    await page.getByRole('button', { name: 'lemme skip this +', exact: true }).click();
    await page.getByRole('button', { name: 'lemme skip this +', exact: true }).click();
    await page.getByRole('button', { name: 'submit', exact: true }).click();
    await expect(page).toHaveURL(/\/itinerary$/);
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')));
    expect(current.plan.stops.every(stop => stop.source === 'curated')).toBe(true);
    await page.goto('/events');
    const matching = page.getByRole('region', { name: 'Ticketmaster events within budget', exact: true });
    const unknown = page.getByRole('region', { name: 'Ticketmaster events with unknown AUD prices', exact: true });
    await expect(matching.locator('.event-post')).toHaveCount(2);
    await expect(matching).toContainText('Mock affordable');
    await expect(matching).toContainText('finish time unknown');
    await expect(matching).toContainText('Advertised from $30 AUD');
    await expect(unknown.locator('.event-post')).toHaveCount(1);
    await expect(unknown).toContainText('AUD price unknown');
    await expect(matching.getByRole('link', { name: /view tickets/ }).first()).toHaveAttribute('href', 'https://www.ticketmaster.com.au/event/affordable');
    await expect(page.getByRole('region', { name: 'event poster feed', exact: true }).locator('.event-post')).toHaveCount(5);
    expect(Object.fromEntries(backend.requests[0].searchParams)).toEqual({
      date: '2026-10-12', time: '11:00', duration: '3', budget: '30', lat: '-33.8965', lng: '151.1794', radius: '2',
    });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toEqual(current);
    await page.reload();
    await expect(matching.locator('.event-post')).toHaveCount(2);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('ticketmaster-320.png'), fullPage: true });
    await page.goto('/plan/details?q=5');
    await page.getByRole('button', { name: 'Tuesday 13 October 2026', exact: true }).click();
    await page.goto('/events');
    await expect(matching.locator('.event-post')).toHaveCount(1);
    await expect(matching).toContainText('Mock next-day');
    expect(errors).toEqual([]);
  } finally { await backend.close(); }
});

test('skipped date uses Sydney today and empty live results remain separate from sample events', async ({ page }) => {
  const backend = await mockBackend(page, []);
  try {
    await page.goto('/plan/details?q=5');
    await page.getByRole('button', { name: 'lemme skip this +', exact: true }).click();
    await page.goto('/events');
    await expect(page.getByRole('status')).toContainText('Ticketmaster · 2026-10-11');
    expect(backend.requests[0].searchParams.has('date')).toBe(false);
    await expect(page.getByText('No Ticketmaster events match these details and feed filters.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ticketmaster events within budget', exact: true }).locator('.event-post')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'event poster feed', exact: true }).locator('.event-post')).toHaveCount(5);
  } finally { await backend.close(); }
});

test('missing Ticketmaster credentials leave existing sample experience usable', async ({ page }) => {
  await page.route('**/api/events?**', route => route.fulfill({ status: 503, json: { error: 'Ticketmaster is not configured on the server.' } }));
  await page.goto('/events');
  await expect(page.getByRole('status')).toContainText('server needs its Ticketmaster key');
  await expect(page.locator('.event-post')).toHaveCount(5);
  await page.getByLabel('search events').fill('live music');
  await expect(page.locator('.event-post')).toHaveCount(1);
});
