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
const missingMap = 'Google Maps is not configured on the event server. Venue coordinates are still listed below.';
const failedMap = 'The Google map preview could not load. Check the connection, browser key and allowed website referrers. Venue coordinates are still listed below.';
async function events(page, data = fixture, script = mapsScript, key = 'mock-js-key') {
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.context().route('https://www.google.com/maps/**', route => route.fulfill({ contentType: 'text/html', body: 'Mock external Google Maps' }));
  await page.route(`${origin}/api/events`, route => route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route(`${origin}/api/events-map?*`, route => route.fulfill({ contentType: 'text/html',
    body: data.points.length ? renderVenueMap(data.points, key) : '' }));
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
  await expect(page.getByText(missingMap)).toBeVisible();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
  await expect(page.getByTestId('ticketmaster-venue-map')).toHaveCount(0);
});

for (const key of ['mock-js-key', 'mock-demo-key']) test(`a rejected browser key (${key}) keeps venues visible and can be retried`, async ({ page }) => {
  await events(page, fixture, 'window.gm_authFailure();', key);
  await page.goto('/events-map');
  await expect(page.getByText(failedMap)).toBeVisible();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
  await events(page, fixture, mapsScript, key);
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
  await expect(page.getByText(failedMap)).toBeVisible();
  await expect(page.getByTestId('venue-pin-A')).toBeVisible();
});
