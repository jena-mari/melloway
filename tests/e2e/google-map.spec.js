import { test, expect } from '@playwright/test';
import { defaultDraft } from '../../src/data/preferences.js';
import { renderVenueMap } from '../../server/eventMap.ts';
import { googleMapsFixture } from './google-maps-fixture.js';
import { itineraryMapPoints } from '../../server/itineraryMap.ts';
import { quietMapStyles } from '../../shared/mapStyles.ts';

async function expectExploreMapStyle(surface) {
  const options = JSON.parse(await surface.getAttribute('data-map-options'));
  expect(options.styles).toEqual(quietMapStyles);
  expect(options.mapId).toBeUndefined();
  expect(options.renderingType).toBe('RASTER');
}

async function expectRoundLetterPin(pin, diameter = '26px') {
  expect(await pin.evaluate(node => {
    const style = getComputedStyle(node), centre = getComputedStyle(node, '::before');
    const letter = getComputedStyle(node.querySelector('.pin-numbers'));
    return { width: style.width, height: style.height, roundness: style.borderRadius,
      border: style.borderTopColor, centre: centre.backgroundColor, letter: letter.color };
  })).toEqual({ width: diameter, height: diameter, roundness: '50%',
    border: 'rgb(17, 17, 17)', centre: 'rgb(255, 255, 255)', letter: 'rgb(17, 17, 17)' });
}

// Synthetic Google-shaped stops and a mocked Maps script: no real provider calls.
const stops = [0, 1, 2].map(index => ({
  id: `mock-google-${index}`, name: `Mock stop ${index + 1}`, source: 'google',
  lat: -33.873 - index * .001, lng: 151.208 - index * .001,
  tags: ['Coffee shops'], category: 'Coffee shops', address: 'Mock Sydney address',
  area: 'Sydney CBD', hours: { open: 540, close: 1320 },
  arrival: 660 + index * 60, mins: 45, cost: 15,
  travelFromPrevious: index ? { minutes: 15, distance: .2, source: 'google' } : null,
}));
const current = { plan: { id: 'mock-google-plan', prefs: { ...defaultDraft(), transport: 'Walking' }, stops,
  cost: 45, elapsed: 165, transportAllowance: 0, notice: 'Mock test plan' }, candidates: [], matrix: [] };
const mapsScript = googleMapsFixture;

async function mapFixture(page, script = mapsScript) {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({status:503,json:{error:'Offline map fixture'}}));
  await page.route('**/api/maps/config', route => route.fulfill({json:{apiKey:'offline-key',mapId:'DEMO_MAP_ID'}}));
  await page.route('**/api/itinerary-routes', route => {
    const { stops, transport } = route.request().postDataJSON();
    return route.fulfill({ json: { transport, missingLegs: 0, warnings: [], paths: stops.slice(1).map((to,index) => ({
      fromIndex: index, toIndex: index + 1,
      path: [{lat:stops[index].lat,lng:stops[index].lng},{lat:stops[index].lat,lng:to.lng},{lat:to.lat,lng:to.lng}],
    })) } });
  });
  await page.route('**/api/status', route => route.fulfill({ json: { venues: 'curated', recommendations: 'planner' } }));
  await page.addInitScript(value => localStorage.setItem('melloway.current', JSON.stringify(value)), current);
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.route('**/api/itinerary-map?*', route => {
    const pins = itineraryMapPoints(JSON.parse(new URL(route.request().url()).searchParams.get('stops')));
    return route.fulfill({ contentType: 'text/html', body: renderVenueMap(pins, 'mock-demo-key', 'itinerary') });
  });
}

test('Google stops match Explore styling with round alphabetical pins in both map views', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mapFixture(page);
  await page.goto('/itinerary');
  const frame = page.frameLocator('.route-map-hero .google-route-map');
  for (let i = 0; i < stops.length; i++) {
    const pin = frame.getByRole('button', { name: `${String.fromCharCode(65 + i)}. ${stops[i].name}` });
    await expect(pin).toBeVisible();
    await expect(pin).toHaveText(String.fromCharCode(65 + i));
    await expectRoundLetterPin(pin);
  }
  await expectExploreMapStyle(frame.locator('#map'));
  expect(await page.locator('.route-map-hero').evaluate(node => ({radius:getComputedStyle(node).borderRadius,
    border:getComputedStyle(node).borderTopWidth}))).toEqual({radius:'20px',border:'1px'});
  await expect(page.getByText('bringing ur stops into view…')).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'stop order', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'show whole route', exact: true })).toHaveCount(0);
  await page.locator('.route-map-hero').screenshot({path:info.outputPath('ur-day-map-controls.png')});
  await frame.getByRole('button', { name: 'B. Mock stop 2' }).click();
  await expect(frame.getByRole('button', {name:'B. Mock stop 2'})).toHaveAttribute('aria-pressed','true');
  await expectRoundLetterPin(frame.getByRole('button', {name:'B. Mock stop 2'}));
  await expect(page.locator('.route-summary-list > li').nth(1)).toHaveClass(/selected-route-stop/);
  await expect(page.getByRole('region',{name:'Mock stop 2 stop details',exact:true})).toBeVisible();
  await page.getByRole('button', { name: 'open Mock stop 2 details', exact: true }).click();
  await expect(page.locator('.route-summary-spot strong')).toHaveText(stops.map(stop => stop.name));
  await page.getByRole('button', { name: 'expand map', exact: true }).click();
  await expect(page.frameLocator('dialog .google-route-map').getByRole('button', { name: 'C. Mock stop 3' })).toBeVisible();
  await expectExploreMapStyle(page.frameLocator('dialog .google-route-map').locator('#map'));
  await expectRoundLetterPin(page.frameLocator('dialog .google-route-map').getByRole('button', {name:'C. Mock stop 3'}));
  await page.screenshot({path:info.outputPath('ur-day-expanded-map.png')});
  await page.frameLocator('dialog .google-route-map').getByRole('button', { name: 'C. Mock stop 3' }).click();
  await expect(page.getByRole('region',{name:'Mock stop 3 stop details',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.route-summary-list > li').nth(2)).toHaveClass(/selected-route-stop/);
});

test('a rejected map key preserves all stop cards and the Google directions link', async ({ page }) => {
  await mapFixture(page, 'window.gm_authFailure();');
  await page.goto('/itinerary');
  await expect(page.getByText('The map couldn’t load. Your stops are still below.')).toBeVisible();
  await expect(page.locator('.route-summary-spot strong')).toHaveText(stops.map(stop => stop.name));
  await expect(page.locator('.map-unavailable a')).toHaveAttribute('href', /waypoints=/);
});

test('Google iframe marker hover previews the exact place and opens its existing posts', async ({ page }) => {
  await mapFixture(page);
  await page.goto('/itinerary');
  const frame = page.frameLocator('.route-map-hero .google-route-map');
  await frame.getByRole('button', { name: 'B. Mock stop 2' }).locator('.pin-numbers').hover();
  const preview = page.getByRole('complementary', { name: 'Place preview' });
  await expect(preview).toContainText('Mock stop 2');
  await expect(preview).toContainText('~$15 each');
  await preview.getByRole('button', { name: 'see the vibe' }).click();
  await expect(page.getByRole('region',{name:'Mock stop 2 stop details',exact:true})).toBeVisible();
  await expect(preview).toHaveCount(0);
});

test('unrelated window messages cannot select a stop or hide the map', async ({ page }) => {
  await mapFixture(page);
  await page.goto('/itinerary');
  await expect(page.frameLocator('.route-map-hero .google-route-map').getByRole('button', { name: 'A. Mock stop 1' })).toBeVisible();
  await page.evaluate(() => {
    window.postMessage({ type: 'melloway-map-stop', index: 2 }, '*');
    window.postMessage({ type: 'melloway-map-error' }, '*');
    window.postMessage({ type: 'melloway-map-preview', index: 2 }, '*');
  });
  await expect(page.locator('.route-summary-list > li').first()).toHaveClass(/selected-route-stop/);
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
  await expect(page.locator('.map-unavailable')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Place preview' })).toHaveCount(0);
});


for (const transport of ['Walking', 'Public transport', 'Driving']) test(`${transport} preserves route geometry and uses --pink in both map views`, async ({page}) => {
  await mapFixture(page);
  await page.addInitScript(transport => {
    const value = JSON.parse(localStorage.getItem('melloway.current'));
    value.plan.prefs.transport = transport;
    localStorage.setItem('melloway.current', JSON.stringify(value));
  }, transport);
  await page.goto('/itinerary');
  const frame = page.frameLocator('.route-map-hero .google-route-map');
  const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pink').trim());
  await expect(frame.locator('#map')).toHaveAttribute('data-route-mode', transport);
  await expect(frame.locator(`[data-route-color="${color}"]`)).toHaveCount(2);
  await expect(frame.locator('#map')).toHaveAttribute('data-fit-padding', JSON.stringify({top:76,right:24,bottom:24,left:24}));
  const path = JSON.parse(await frame.locator(`[data-route-color="${color}"]`).first().getAttribute('data-route-path'));
  expect(path).toHaveLength(3);
  expect(path[1]).toEqual({lat:stops[0].lat,lng:stops[1].lng});
  await page.getByRole('button',{name:'expand map',exact:true}).click();
  await expect(page.frameLocator('dialog .google-route-map').locator(`[data-route-color="${color}"]`)).toHaveCount(2);
});

test('a missing route keeps the pins and cards usable without drawing guessed connections', async ({page}) => {
  await mapFixture(page);
  await page.route('**/api/itinerary-routes', route => route.fulfill({status:502,json:{error:'Unavailable'}}));
  await page.goto('/itinerary');
  await expect(page.locator('.map-caption')).toContainText('Some route connections are unavailable');
  const frame=page.frameLocator('.route-map-hero .google-route-map');
  await expect(frame.getByRole('button',{name:'A. Mock stop 1'})).toBeVisible();
  await expect(frame.locator('[data-route-path]')).toHaveCount(0);
  await expect(page.locator('.route-summary-spot strong')).toHaveText(stops.map(stop => stop.name));
});


test('curated stops match Explore styling, retain grouped letters and use the real pink route', async ({page}, info) => {
  await mapFixture(page);
  await page.route('**/api/maps/config', route => route.fulfill({json:{apiKey:'mock-key',mapId:'DEMO_MAP_ID'}}));
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({contentType:'text/javascript',body:googleMapsFixture}));
  await page.addInitScript(() => {
    const value=JSON.parse(localStorage.getItem('melloway.current'));
    value.plan.stops.forEach(stop => stop.source='curated');
    localStorage.setItem('melloway.current',JSON.stringify(value));
  });
  await page.goto('/itinerary');
  await expect(page.locator('.route-map-hero .google-map-surface')).toHaveAttribute('data-route-legs','2');
  await expect(page.locator('.route-map-hero .google-map-surface')).toHaveAttribute('data-route-mode','Walking');
  const surface = page.locator('.route-map-hero .google-map-surface');
  await expectExploreMapStyle(surface);
  const pink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pink').trim());
  await expect(surface.locator(`[data-route-color="${pink}"]`)).toHaveCount(2);
  await expect(surface.locator('[data-route-icons]')).toHaveCount(0);
  const pin = surface.locator('.route-pin').first();
  await expectRoundLetterPin(pin, '44px');
  expect((await surface.locator('.pin-numbers').allTextContents()).flatMap(s => s.split(' · ')).sort()).toEqual(['A','B','C']);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:info.outputPath('ur-day-curated-map.png')});
  await page.getByRole('button',{name:'expand map',exact:true}).click();
  await expectExploreMapStyle(page.locator('dialog .google-map-surface'));
  await expect(page.locator(`dialog [data-route-color="${pink}"]`)).toHaveCount(2);
  await expect(page.locator('.map-caption')).toContainText('Walking route');
});

for (const source of ['google','curated']) test(`${source} routes read --pink from the app theme`, async ({page}) => {
  await mapFixture(page);
  await page.addInitScript(source => {
    const value=JSON.parse(localStorage.getItem('melloway.current'));
    value.plan.stops.forEach(stop => stop.source=source);
    localStorage.setItem('melloway.current',JSON.stringify(value));
  }, source);
  await page.goto('/itinerary');
  const surface = source === 'google' ? page.frameLocator('.route-map-hero .google-route-map').locator('#map')
    : page.locator('.route-map-hero .google-map-surface');
  await expect(surface).toHaveAttribute('data-route-legs','2');
  await page.evaluate(() => document.documentElement.style.setProperty('--pink','#de789c'));
  await page.getByRole('combobox',{name:'transportation',exact:true}).selectOption('Driving');
  await expect(surface).toHaveAttribute('data-route-mode','Driving');
  await expect(surface.locator('[data-route-color="#de789c"]')).toHaveCount(2);
});
