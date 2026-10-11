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

test('verified Sydney highlights remain useful without Instagram discovery and survive save, like and expiry', async ({ page }, info) => {
  await page.route('**/api/events?**', route => route.fulfill({ status: 503, json: { error: 'Mock unavailable' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/events');
  const rail = page.getByRole('region', { name: 'Upcoming Sydney highlights' });
  await expect(rail.locator('.sydney-event-tile')).toHaveCount(3);
  await expect(rail.getByRole('link', { name: 'SURPLUS on Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/surplussydney/');
  await page.getByRole('button', { name: 'Save event SURPLUS 2026', exact: true }).click();
  await page.screenshot({ path: info.outputPath('sydney-highlights-390.png') });
  await page.goto('/favourites?tab=events');
  await expect(page.locator('.saved-event-card')).toContainText('16–18 Oct 2026');
  await page.getByRole('link', { name: 'SURPLUS 2026', exact: true }).click();
  const post = page.locator('.event-post');
  await expect(post).toContainText('organiser');
  await expect(post).not.toContainText('sample event');
  await expect(post.getByRole('link', { name: 'event details' })).toHaveAttribute('href', 'https://surplus.sydney/');
  await post.getByRole('button', { name: 'Like event SURPLUS 2026' }).click();
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Your Likes' }).click();
  await expect(page.locator('.profile-event-card')).toContainText('SURPLUS 2026');
  await page.clock.setFixedTime(new Date('2026-11-04T00:00:00Z'));
  await page.goto('/events');
  await expect(rail).toHaveCount(0);
  await page.getByRole('button', { name: 'saved', exact: true }).click();
  await expect(rail.locator('.sydney-event-tile')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toBeNull();
});

test('Instagram announcements show original previews and persist in Saved and Profile without changing the plan', async ({ page }) => {
  const posts = [
    { url: 'https://www.instagram.com/p/MockSydneyMarket/', title: 'Mock Sydney Makers Market', host: 'Mock Makers', handle: 'mockmakers', type: 'markets',
      area: 'Mock Hall, Newtown', startDate: '2026-10-17', endDate: '2026-10-17', text: 'Local makers and food.' },
    { url: 'https://www.instagram.com/reel/MockSydneyGallery/', title: 'Mock Gallery Night', host: 'Mock Gallery', handle: 'mockgallery', type: 'exhibitions',
      area: 'Mock Gallery, Sydney CBD', startDate: '2026-10-18', endDate: '2026-10-19', text: 'An evening exhibition.' },
    { url: 'https://www.instagram.com/p/MockSydneyMusic/', title: 'Mock Live Music', host: 'Mock Music', handle: 'mockmusic', type: 'concerts',
      area: 'Mock Stage, Surry Hills', startDate: '2026-10-20', endDate: '2026-10-20', text: 'Live music in Sydney.' },
  ];
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'curated', recommendations: 'planner', socialDiscovery: 'openai' } }));
  await page.route('**/api/events?**', route => route.fulfill({ status: 503, json: { error: 'Mock Ticketmaster unavailable' } }));
  let searches = 0;
  await page.route('**/api/social/events', route => {
    searches++;
    expect(route.request().postDataJSON()).toEqual({});
    return route.fulfill({ json: { posts } });
  });
  await page.route('https://www.instagram.com/**', route => route.fulfill({ contentType: 'text/html',
    body: '<html><body style="margin:0;font-family:sans-serif"><p>Mock organiser · Instagram</p><div style="height:360px;background:#edb6c8;display:grid;place-items:center">Sydney event poster fixture</div></body></html>' }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/events');
  const feed = page.getByRole('region', { name: 'Sydney events from Instagram' });
  await expect(feed.locator('.event-post')).toHaveCount(3);
  const market = feed.getByRole('article', { name: posts[0].title });
  await expect(market).toContainText('17 Oct 2026');
  await expect(market).toContainText('Mock Hall, Newtown');
  await expect(market.locator('iframe')).toHaveAttribute('src', `${posts[0].url}embed/`);
  await expect(market.getByRole('link', { name: 'view original post' })).toHaveAttribute('href', posts[0].url);
  await expect(market).not.toContainText('sample event');
  await market.getByRole('button', { name: `Save event ${posts[0].title}` }).click();
  await feed.getByRole('button', { name: `Like event ${posts[1].title}` }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await market.screenshot({ path: `/private/tmp/melloway-instagram-event-${width}.png` });
  }
  await page.getByLabel('search events').fill('Mock Sydney Makers');
  await expect(feed.locator('.event-post')).toHaveCount(1);
  await page.getByLabel('search events').fill('');
  await page.getByRole('button', { name: 'saved', exact: true }).click();
  await expect(feed.locator('.event-post')).toHaveCount(1);
  await page.getByRole('button', { name: 'liked', exact: true }).click();
  await expect(feed.locator('.event-post')).toHaveCount(1);
  await expect(feed).toContainText(posts[1].title);
  expect(searches).toBe(1); // Local filters never trigger more paid discovery.
  await page.route('**/api/social/events', route => route.fulfill({ json: { posts: [] } }));
  await page.goto('/favourites?tab=events');
  await expect(page.getByRole('heading', { name: posts[0].title })).toBeVisible();
  await expect(page.locator('.saved-event-card')).toContainText('Instagram');
  await page.getByRole('link', { name: `View event ${posts[0].title}`, exact: true }).click();
  await expect(feed.getByRole('article', { name: posts[0].title })).toBeVisible();
  await page.goto('/profile?tab=saved');
  await expect(page.locator('.profile-event-card')).toContainText(posts[0].title);
  await page.goto('/profile?tab=likes');
  await expect(page.locator('.profile-event-card')).toContainText(posts[1].title);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')))).toBeNull();
  expect(errors).toEqual([]);
});

test('failed Instagram discovery keeps the existing feed and the Sydney search link usable', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { socialDiscovery: 'openai' } }));
  await page.route('**/api/social/events', route => route.fulfill({ status: 502, json: { error: 'Mock unavailable' } }));
  await page.route('**/api/events?**', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/events');
  const feed = page.getByRole('region', { name: 'Sydney events from Instagram' });
  await expect(feed).toContainText('Instagram posts are unavailable right now.');
  await expect(feed.getByRole('link', { name: 'browse' })).toHaveAttribute('href', 'https://www.instagram.com/explore/search/keyword/?q=sydney&hl=en');
  await expect(feed.locator('.event-post')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'event poster feed' }).locator('.event-post')).toHaveCount(5);
});
