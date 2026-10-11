import { test, expect } from '@playwright/test';
import { renderVenueMap } from '../../server/eventMap.ts';

const origin = 'http://localhost:3001';
const fixture = {
  events: [{ id: 'mock-1', name: 'Mock Sydney event', startDate: '2026-10-12', startTime: '19:00:00',
    venue: { name: 'Mock venue' }, priceRanges: null },
  { id: 'mock-2', name: 'Another mock event', startDate: '2026-10-13', startTime: null, venue: null, priceRanges: null }],
  points: [{ label: 'A', name: 'Mock venue', address: '1 Mock Street, Sydney', latitude: -33.86,
    longitude: 151.21, eventIds: ['mock-1'] }],
  missingCoordinates: 1, mapAvailable: true,
};
// Provider data and Maps JavaScript API are mocked: no real API requests or keys.
const mapsScript = `
window.google = { maps: {
  importLibrary: async name => name === 'maps' ? { Map: class {
    constructor(element) { this.element = element; }
    fitBounds(bounds) { this.element.dataset.bounds = JSON.stringify(bounds.points); }
  } } : {
    PinElement: class { constructor(options) { const element = document.createElement('span'); element.textContent = options.glyphText; return element; } },
    AdvancedMarkerElement: class { constructor(options) { this.options = options; } append(pin) {
      const button = document.createElement('button'); button.textContent = pin.textContent;
      button.setAttribute('aria-label', this.options.title); document.getElementById('map').appendChild(button);
    } }
  },
  LatLngBounds: class { points = []; extend(position) { this.points.push(position); } }
} }; window.initVenueMap();`;
async function events(page, data = fixture, script = mapsScript) {
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.context().route('https://www.google.com/maps/**', route => route.fulfill({ contentType: 'text/html', body: 'Mock external Google Maps' }));
  await page.route(`${origin}/api/events`, route => route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route(`${origin}/api/events-map?*`, route => route.fulfill({ contentType: 'text/html',
    body: data.points.length ? renderVenueMap(data.points, 'mock-demo-key') : '' }));
}

test('home opens the venue map, showing real-coordinate pins and events without coordinates', async ({ page }) => {
  await events(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ticketmaster venue map', exact: true }).click();
  await expect(page).toHaveURL(/\/events-map$/);
  await expect(page.getByText('2 events · 1 venue pins', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ticketmaster-venue-map')).toBeVisible();
  await expect(page.frameLocator('[data-testid="ticketmaster-venue-map"]').getByRole('button', { name: 'A. Mock venue' })).toBeVisible();
  await expect(page.getByTestId('venue-pin-A').getByText('-33.86, 151.21')).toBeVisible();
  await expect(page.getByText('1 events have no usable venue coordinates and cannot be pinned.')).toBeVisible();
  await expect(page.getByText('Another mock event', { exact: true })).toBeVisible();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open venue A in Google Maps', exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL('https://www.google.com/maps/search/?api=1&query=-33.86,151.21');
  await popup.close();
});

test('empty events show an empty state and no map', async ({ page }) => {
  await events(page, { events: [], points: [], missingCoordinates: 0, mapAvailable: true });
  await page.goto('/events-map');
  await expect(page.getByText('No upcoming Sydney events were returned.')).toBeVisible();
  await expect(page.getByTestId('ticketmaster-venue-map')).toHaveCount(0);
});

test('a failed event request can be retried', async ({ page }) => {
  await page.route(`${origin}/api/events`, route => route.fulfill({ status: 502,
    json: { error: 'Unavailable' }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/events-map');
  await expect(page.getByRole('alert')).toContainText('Event venues could not be loaded.');
  await events(page);
  await page.getByRole('button', { name: 'Refresh venues', exact: true }).click();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a missing Google key keeps venue coordinates visible', async ({ page }) => {
  await events(page, { ...fixture, mapAvailable: false });
  await page.goto('/events-map');
  await expect(page.getByText('The Google map preview is unavailable. Venue coordinates are still listed below.')).toBeVisible();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
  await expect(page.getByTestId('ticketmaster-venue-map')).toHaveCount(0);
});

test('a rejected Demo Key keeps venue coordinates visible and can be retried', async ({ page }) => {
  await events(page, fixture, 'window.gm_authFailure();');
  await page.goto('/events-map');
  await expect(page.getByText('The Google map preview is unavailable. Venue coordinates are still listed below.')).toBeVisible();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
  await events(page);
  await page.getByRole('button', { name: 'Refresh venues', exact: true }).click();
  await expect(page.frameLocator('[data-testid="ticketmaster-venue-map"]').getByRole('button', { name: 'A. Mock venue' })).toBeVisible();
});

test('every distinct venue gets a marker and is included in the fitted bounds', async ({ page }) => {
  const points = [...fixture.points, { ...fixture.points[0], label: 'B', name: 'Second mock venue',
    latitude: -33.87, longitude: 151.22, eventIds: ['mock-2'] }];
  await events(page, { ...fixture, points, missingCoordinates: 0 });
  await page.goto('/events-map');
  const map = page.frameLocator('[data-testid="ticketmaster-venue-map"]');
  await expect(map.getByRole('button')).toHaveCount(2);
  await expect(map.getByRole('button', { name: 'B. Second mock venue' })).toBeVisible();
  await expect(map.locator('#map')).toHaveAttribute('data-bounds',
    JSON.stringify(points.map(point => ({ lat: point.latitude, lng: point.longitude }))));
});

test('a failed JavaScript loader preserves the venue list', async ({ page }) => {
  await events(page);
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.goto('/events-map');
  await expect(page.getByText('The Google map preview is unavailable. Venue coordinates are still listed below.')).toBeVisible();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
});


// Useful event details: fixture-only listing links, prices and categories.
test('pinned and unpinned events show supplied dates, categories, prices and listing links', async ({ page, context }) => {
  const data = { ...fixture, events: [
    { ...fixture.events[0], category: 'Music', timezone: 'Australia/Sydney',
      priceRanges: [{ min: 25.5, max: 80, currency: 'AUD' }], url: 'https://tickets.example/mock-1?source=fixture' },
    { ...fixture.events[1], category: 'Arts', priceRanges: [{ min: 10, max: 10, currency: 'NZD' }],
      url: 'https://tickets.example/mock-2' },
  ] };
  await context.route('https://tickets.example/**', route => route.fulfill({ contentType: 'text/html', body: 'Mock original event listing' }));
  await events(page, data);
  await page.goto('/events-map');
  const pinned = page.getByTestId('event-details-mock-1');
  const unpinned = page.getByTestId('event-details-mock-2');
  await expect(pinned.getByText('Mock Sydney event', { exact: true })).toBeVisible();
  await expect(pinned.getByText('2026-10-12 · 19:00:00 · Australia/Sydney', { exact: true })).toBeVisible();
  await expect(pinned.getByText('Music', { exact: true })).toBeVisible();
  await expect(pinned.getByText('Advertised price: 25.5–80 AUD', { exact: true })).toBeVisible();
  await expect(unpinned.getByText('2026-10-13 · Time unconfirmed', { exact: true })).toBeVisible();
  await expect(unpinned.getByText('Arts', { exact: true })).toBeVisible();
  await expect(unpinned.getByText('Advertised price: 10 NZD', { exact: true })).toBeVisible();
  for (const [details, url] of [[pinned, data.events[0].url], [unpinned, data.events[1].url]]) {
    const opened = page.waitForEvent('popup');
    await details.getByRole('button', { name: 'View event / tickets', exact: true }).click();
    const popup = await opened;
    await expect(popup).toHaveURL(url);
    await popup.close();
  }
});

test('missing prices stay unavailable, zero is not called free, and invalid listing links are hidden', async ({ page }) => {
  await events(page, { ...fixture, events: [
    { ...fixture.events[0], category: null, url: 'javascript:alert(1)' },
    { ...fixture.events[1], category: '', priceRanges: [{ min: 0, max: 0, currency: null }], url: 'https:///tickets.example' },
  ] });
  await page.goto('/events-map');
  await expect(page.getByTestId('event-details-mock-1').getByText('Price unavailable', { exact: true })).toBeVisible();
  await expect(page.getByTestId('event-details-mock-2').getByText('Advertised price: 0 (currency unavailable)', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View event / tickets', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Free/i)).toHaveCount(0);
});

test('absent optional event fields do not crash or invent prices, categories or links', async ({ page }) => {
  const { priceRanges, ...missing } = fixture.events[1];
  await events(page, { events: [missing], points: [], missingCoordinates: 1, mapAvailable: false });
  await page.goto('/events-map');
  await expect(page.getByText('Another mock event', { exact: true })).toBeVisible();
  await expect(page.getByText('2026-10-13 · Time unconfirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Price unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View event / tickets', exact: true })).toHaveCount(0);
});

test('a failed listing opener shows a recoverable error without crashing the event screen', async ({ page }) => {
  await events(page, { ...fixture, events: [
    { ...fixture.events[0], url: 'https://tickets.example/mock-1' }, fixture.events[1],
  ] });
  await page.addInitScript(() => {
    const original = window.open;
    let fail = true;
    window.open = (...args) => {
      if (fail) { fail = false; throw new Error('Mock browser opening failure'); }
      return original.apply(window, args);
    };
  });
  await page.context().route('https://tickets.example/**', route => route.fulfill({ body: 'Mock listing' }));
  await page.goto('/events-map');
  const details = page.getByTestId('event-details-mock-1');
  await details.getByRole('button', { name: 'View event / tickets', exact: true }).click();
  await expect(details.getByRole('alert')).toHaveText('The event listing could not be opened. Please try again.');
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
  const opened = page.waitForEvent('popup');
  await details.getByRole('button', { name: 'View event / tickets', exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL('https://tickets.example/mock-1');
  await expect(details.getByRole('alert')).toHaveCount(0);
  await popup.close();
});
