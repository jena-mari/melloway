import { test, expect } from '@playwright/test';
import { defaultDraft } from '../../src/data/preferences.js';
import { renderVenueMap } from '../../server/eventMap.ts';
import { itineraryMapPoints } from '../../server/itineraryMap.ts';

// Synthetic Google-shaped stops and a mocked Maps script: no real provider calls.
const stops = [0, 1, 2].map(index => ({
  id: `mock-google-${index}`, name: `Mock stop ${index + 1}`, source: 'google',
  lat: -33.873 - index * .001, lng: 151.208 - index * .001,
  tags: ['Coffee shops'], category: 'Coffee shops', address: 'Mock Sydney address',
  arrival: 660 + index * 60, mins: 45, cost: 15,
  travelFromPrevious: index ? { minutes: 15, distance: .2, source: 'google' } : null,
}));
const current = { plan: { id: 'mock-google-plan', prefs: defaultDraft(), stops,
  cost: 45, elapsed: 165, transportAllowance: 0, notice: 'Mock test plan' }, candidates: [], matrix: [] };
const mapsScript = `window.google = { maps: {
  importLibrary: async name => name === 'maps' ? { Map: class {
    constructor(element) {
      this.element = element;
      // Mock pins occupy the map centre, like fitted real markers, clear of its toolbar.
      Object.assign(element.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' });
    }
    fitBounds(bounds) { this.element.dataset.bounds = JSON.stringify(bounds.points); }
  } } : {
    PinElement: class { constructor(options) { const pin = document.createElement('span'); pin.textContent = options.glyphText; return pin; } },
    AdvancedMarkerElement: class {
      constructor(options) { this.button = document.createElement('button'); this.button.setAttribute('aria-label', options.title); }
      append(pin) { this.button.append(pin); document.getElementById('map').append(this.button); }
      addListener(type, callback) { this.button.addEventListener(type, callback); }
    }
  },
  LatLngBounds: class { points = []; extend(position) { this.points.push(position); } }
} }; window.initVenueMap();`;

async function mapFixture(page, script = mapsScript) {
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'curated', recommendations: 'planner' } }));
  await page.addInitScript(value => localStorage.setItem('melloway.current', JSON.stringify(value)), current);
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.route('**/api/itinerary-map?*', route => {
    const pins = itineraryMapPoints(JSON.parse(new URL(route.request().url()).searchParams.get('stops')));
    return route.fulfill({ contentType: 'text/html', body: renderVenueMap(pins, 'mock-demo-key', 'itinerary') });
  });
}

test('Google stops get numbered pins; selecting a pin selects its existing stop card', async ({ page }) => {
  await mapFixture(page);
  await page.goto('/itinerary');
  const frame = page.frameLocator('.route-map-hero .google-route-map');
  for (let i = 0; i < stops.length; i++) {
    await expect(frame.getByRole('button', { name: `${i + 1}. ${stops[i].name}` })).toBeVisible();
  }
  await expect(page.getByText('bringing ur stops into view…')).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await frame.getByRole('button', { name: '2. Mock stop 2' }).click();
  await expect(page.locator('#stop-1 .stop-card')).toHaveClass(/selected-stop/);
  await expect(page.getByRole('dialog')).toContainText('Mock stop 2');
  await page.getByRole('button', { name: 'close spot details', exact: true }).click();
  await expect(page.locator('.stop-body h2')).toHaveText(stops.map(stop => stop.name));
  await page.getByRole('button', { name: 'expand map', exact: true }).click();
  await expect(page.frameLocator('dialog .google-route-map').getByRole('button', { name: '3. Mock stop 3' })).toBeVisible();
  await page.frameLocator('dialog .google-route-map').getByRole('button', { name: '3. Mock stop 3' }).click();
  await expect(page.getByRole('dialog')).toContainText('Mock stop 3');
  await expect(page.locator('#stop-2 .stop-card')).toHaveClass(/selected-stop/);
});

test('a rejected map key preserves all stop cards and the Google directions link', async ({ page }) => {
  await mapFixture(page, 'window.gm_authFailure();');
  await page.goto('/itinerary');
  await expect(page.getByText('The map couldn’t load. Your stops are still below.')).toBeVisible();
  await expect(page.locator('.stop-body h2')).toHaveText(stops.map(stop => stop.name));
  await expect(page.locator('.map-unavailable a')).toHaveAttribute('href', /waypoints=/);
});

test('Google iframe marker hover previews the exact place and opens its existing posts', async ({ page }) => {
  await mapFixture(page);
  await page.goto('/itinerary');
  const frame = page.frameLocator('.route-map-hero .google-route-map');
  await frame.getByRole('button', { name: '2. Mock stop 2' }).locator('span').hover();
  const preview = page.getByRole('complementary', { name: 'Place preview' });
  await expect(preview).toContainText('Mock stop 2');
  await expect(preview).toContainText('~$15 each');
  await preview.getByRole('button', { name: 'see the vibe' }).click();
  await expect(page.getByRole('dialog')).toContainText('Mock stop 2');
  await expect(preview).toHaveCount(0);
});

test('unrelated window messages cannot select a stop or hide the map', async ({ page }) => {
  await mapFixture(page);
  await page.goto('/itinerary');
  await expect(page.frameLocator('.route-map-hero .google-route-map').getByRole('button', { name: '1. Mock stop 1' })).toBeVisible();
  await page.evaluate(() => {
    window.postMessage({ type: 'melloway-map-stop', index: 2 }, '*');
    window.postMessage({ type: 'melloway-map-error' }, '*');
    window.postMessage({ type: 'melloway-map-preview', index: 2 }, '*');
  });
  await expect(page.locator('#stop-0 .stop-card')).toHaveClass(/selected-stop/);
  await expect(page.locator('.map-unavailable')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Place preview' })).toHaveCount(0);
});
