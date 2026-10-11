import { test, expect } from '@playwright/test';
import { renderVenueMap } from '../../server/eventMap.ts';

// Fictional provider fixtures only. The real catalogue and paid APIs are never used.
const places = [1, 2, 3, 4, 5].map(index => ({
  name: `Mock Café ${index}`, suburb: 'Newtown',
  sourceUrl: `https://www.tiktok.com/@mock_fixture/video/900000000000000000${index}`,
  normalizedUrl: `https://www.tiktok.com/@mock_fixture/video/900000000000000000${index}`,
  postId: `900000000000000000${index}`, evidence: 'Fictional test fixture',
  placeId: `ChIJ_MOCK_${index}`, discoveredAt: '2026-10-11T06:00:00.000Z', reviewStatus: 'pending',
  label: String.fromCharCode(64 + index), address: `${index} Fictional Test Street`,
  latitude: -33.897 + index / 10000, longitude: 151.179 + index / 10000,
  mapsUri: `https://www.google.com/maps/search/?api=1&query=Mock%20Cafe&query_place_id=ChIJ_MOCK_${index}`,
}));
const fixture = { places, mapAvailable: true, missingCoordinates: 0, unmatchedCount: 1 };
const mapsScript = `window.google = { maps: {
  importLibrary: async name => name === 'maps' ? { Map: class { fitBounds() {} } } : {
    PinElement: class { constructor(options) { const element = document.createElement('span'); element.textContent = options.glyphText; return element; } },
    AdvancedMarkerElement: class { constructor(options) { this.options = options; } append(pin) {
      const button = document.createElement('button'); button.textContent = pin.textContent;
      button.setAttribute('aria-label', this.options.title); document.getElementById('map').appendChild(button);
    } }
  }, LatLngBounds: class { extend() {} }
} }; window.initVenueMap();`;
async function mockPlaces(page, data = fixture, script = mapsScript) {
  // Both local and physical-phone API origins are intercepted.
  await page.route('**/api/tiktok-places', route => route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route('**/api/tiktok-places-map?*', route => route.fulfill({ contentType: 'text/html',
    body: renderVenueMap(data.places.filter(place => place.latitude !== null).map(place => ({ ...place, eventIds: [place.placeId] })), 'mock-public-key', 'tiktok') }));
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.context().route('https://www.google.com/maps/**', route => route.fulfill({ contentType: 'text/html', body: 'Mock Google Maps' }));
  await page.context().route('https://www.tiktok.com/**', route => route.fulfill({ contentType: 'text/html', body: 'Mock TikTok post' }));
}

test('landing opens five different café pins, with one source and place link per café', async ({ page }) => {
  let reads = 0;
  page.on('request', request => { if (request.url().endsWith('/api/tiktok-places')) reads++; });
  await mockPlaces(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'TikTok places map', exact: true }).click();
  await expect(page).toHaveURL(/\/tiktok-places$/);
  await expect(page.getByText('5 places · 5 map pins', { exact: true })).toBeVisible();
  const map = page.frameLocator('[data-testid="tiktok-places-map"]');
  await expect(map.getByRole('button')).toHaveCount(5);
  await expect(map.getByRole('button', { name: 'E. Mock Café 5', exact: true })).toBeVisible();
  await expect(page.getByText('TikTok match awaiting review', { exact: true })).toHaveCount(5);
  const sourceButton = page.getByRole('button', { name: 'View Mock Café 1 on TikTok', exact: true });
  // ScrollView can cancel a press during scrolling; finish scrolling before exercising the link.
  await sourceButton.scrollIntoViewIfNeeded();
  await expect(sourceButton).toBeInViewport();
  // Capture external tabs at the context level; Linking uses noopener.
  const sourceOpened = page.context().waitForEvent('page');
  await sourceButton.click();
  const source = await sourceOpened;
  await expect(source).toHaveURL(places[0].sourceUrl);
  await source.close();
  const mapsOpened = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Open Mock Café 1 in Google Maps', exact: true }).click();
  const externalMap = await mapsOpened;
  await expect(externalMap).toHaveURL(places[0].mapsUri);
  await externalMap.close();
  await page.getByRole('button', { name: 'Refresh places', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(map.getByRole('button')).toHaveCount(5);
});

test('no saved discoveries show the empty state with no invented pins', async ({ page }) => {
  await mockPlaces(page, { places: [], mapAvailable: false, missingCoordinates: 0, unmatchedCount: 0 });
  await page.goto('/tiktok-places');
  await expect(page.getByText('No TikTok places saved yet. New discoveries will appear here once their locations match.')).toBeVisible();
  await expect(page.getByTestId('tiktok-places-map')).toHaveCount(0);
});

test('connection errors can be refreshed; rejected Google map loads keep usable café links', async ({ page }) => {
  await page.route('**/api/tiktok-places', route => route.fulfill({ status: 502, json: {}, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/tiktok-places');
  await expect(page.getByRole('alert')).toContainText('Places could not be loaded.');
  await mockPlaces(page, fixture, 'window.gm_authFailure();');
  await page.getByRole('button', { name: 'Refresh places', exact: true }).click();
  await expect(page.getByText('The map preview is unavailable. You can still open each place in Google Maps.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Mock Café 1 on TikTok', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
