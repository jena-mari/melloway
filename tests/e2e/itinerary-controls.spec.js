import { test, expect } from '@playwright/test';
import { defaultDraft } from '../../src/data/preferences.js';
import { editRoute } from '../../src/utils/planner.js';
import { mockMapTiles } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const prefs = { ...defaultDraft(), area: 'Sydney CBD', date: '2026-10-12', transport: 'Walking', duration: 8, budget: 100 };
const candidates = ['a', 'b', 'c', 'd'].map((id, i) => ({ id: `edit-${id}`, name: `Fixture bookshop ${id}`, address: `Test ${i} Sydney address`,
  score: 10, source: 'curated', area: 'Sydney CBD', lat: -33.87 - .001 * i, lng: 151.208 + .001 * i,
  tags: ['Bookshops'], category: 'Bookshops', hours: { open: 540, close: 1320 }, cost: 10, mins: 30 }));
const matrix = [[0,30,1,5], [2,0,30,5], [30,1,0,5], [5,5,5,0]].map(row => row.map(minutes => ({minutes, distance: .1, source: 'estimate'})));
const plan = { ...editRoute(candidates.slice(0,3), prefs, candidates, matrix), prefs, id: 'controls-fixture', notice: 'Offline test venues.' };
const storedPlan = page => page.evaluate(() => JSON.parse(localStorage.getItem('melloway.current')).plan);
test.beforeEach(async ({page}) => {
  await mockMapTiles(page);
  await page.addInitScript(bundle => {
    if (!sessionStorage.getItem('controls-ready')) {
      sessionStorage.setItem('controls-ready', '1');
      localStorage.setItem('melloway.current', JSON.stringify(bundle));
    }
  }, {plan, candidates, matrix});
});

test('timeframe edits cascade, invalid arrivals preserve the plan, and saving survives reload', async ({page}, info) => {
  await page.goto('/itinerary');
  await page.getByRole('button', {name:'edit Fixture bookshop a timeframe',exact:true}).click();
  const sheet = page.getByRole('dialog', {name:'Fixture bookshop a',exact:true});
  await sheet.getByLabel('arrive at').fill('12:00');
  await sheet.getByLabel('visit length in minutes').fill('120');
  await sheet.getByRole('button',{name:'save timeframe',exact:true}).click();
  await expect(sheet).not.toBeVisible();
  const edited = await storedPlan(page);
  expect(edited.stops.map(s => s.arrival)).toEqual([720,870,930]);
  await expect(page.locator('.route-summary-spot').first()).toContainText('12:00 pm–2:00 pm');
  await page.getByRole('button', {name:'edit Fixture bookshop b timeframe',exact:true}).click();
  const otherSheet = page.getByRole('dialog',{name:'Fixture bookshop b',exact:true});
  await otherSheet.getByLabel('arrive at').fill('11:00');
  await otherSheet.getByRole('button',{name:'save timeframe',exact:true}).click();
  await expect(otherSheet.getByRole('alert')).toBeVisible();
  expect((await storedPlan(page)).stops).toEqual(edited.stops);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'lock this in',exact:true}).click();
  await page.reload();
  await expect(page.locator('.route-summary-list > li')).toHaveCount(3);
  await expect(page.locator('.route-summary-spot').first()).toContainText('12:00 pm–2:00 pm');
  expect((await storedPlan(page)).stops).toEqual(edited.stops);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.saved')));
  expect(saved.at(-1).stops).toEqual(edited.stops);
  await page.screenshot({path:info.outputPath('editable-timeframes.png'),fullPage:true});
});

test('optimise and shuffle preserve places and sync letters, selection and directions', async ({page}) => {
  await page.goto('/itinerary');
  await page.getByRole('button',{name:'optimise route',exact:true}).click();
  await expect.poll(async () => (await storedPlan(page)).travel).toBe(2);
  expect((await storedPlan(page)).stops.map(s=>s.id)).toEqual(['edit-a','edit-c','edit-b']);
  await page.getByRole('button',{name:'shuffle route',exact:true}).click();
  await expect.poll(async () => (await storedPlan(page)).stops.map(s=>s.id).join(',')).not.toBe('edit-a,edit-c,edit-b');
  const shuffled = await storedPlan(page);
  expect(shuffled.stops.map(s=>s.id).sort()).toEqual(['edit-a','edit-b','edit-c']);
  await expect(page.locator('.route-letter')).toHaveText(['A','B','C']);
  const labels = (await page.locator('.pin-numbers').allTextContents()).flatMap(s=>s.split(' · ')).sort();
  expect(labels).toEqual(['A','B','C']);
  await page.getByRole('button',{name:`view ${shuffled.stops[1].name} details`,exact:true}).click();
  await expect(page.getByRole('region', {name:`${shuffled.stops[1].name} stop details`,exact:true})).toBeVisible();
  await expect(page.locator('.route-summary-list > li').nth(1)).toHaveClass(/selected-route-stop/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:`view ${shuffled.stops[1].name} details`,exact:true}).click();
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
  const href = new URL(await page.getByRole('link',{name:'open Google Maps',exact:true}).getAttribute('href'));
  expect(href.searchParams.get('origin')).toBe(`${shuffled.stops[0].lat},${shuffled.stops[0].lng}`);
  expect(href.searchParams.get('travelmode')).toBe('walking');
});

test('individual regeneration preserves edited timeframes and all other places', async ({page}) => {
  await page.goto('/itinerary');
  await page.getByRole('button',{name:'edit Fixture bookshop a timeframe',exact:true}).click();
  const sheet = page.getByRole('dialog',{name:'Fixture bookshop a',exact:true});
  await sheet.getByLabel('arrive at').fill('12:00');
  await sheet.getByLabel('visit length in minutes').fill('60');
  await sheet.getByRole('button',{name:'save timeframe',exact:true}).click();
  await expect(sheet).not.toBeVisible();
  const before = await storedPlan(page);
  await page.getByRole('button',{name:'regenerate Fixture bookshop a',exact:true}).click();
  await expect.poll(async () => (await storedPlan(page)).stops[0].id).toBe('edit-d');
  const after = await storedPlan(page);
  expect(after.stops.slice(1).map(s=>s.id)).toEqual(before.stops.slice(1).map(s=>s.id));
  expect(after.stops[0].arrivalOverride).toBe(720);
  expect(after.stops[0].mins).toBe(60);
});

test('mode changes refresh route geometry; unset stays neutral and actions remain above navigation', async ({page}, info) => {
  await page.goto('/itinerary');
  for (const transport of ['Public transport','Driving','Walking','Not selected']) {
    await page.getByRole('combobox',{name:'transportation',exact:true}).selectOption(transport);
    await expect.poll(async () => (await storedPlan(page)).prefs.transport).toBe(transport);
    const mode = new URL(await page.getByRole('link',{name:'open Google Maps',exact:true}).getAttribute('href')).searchParams.get('travelmode');
    expect(mode).toBe(transport==='Not selected' ? null : transport==='Walking' ? 'walking' : transport==='Driving' ? 'driving' : 'transit');
    if (transport==='Not selected') {
      await expect(page.locator('.route-map-hero .google-map-surface')).toHaveAttribute('data-route-legs','0');
      await expect(page.locator('.map-caption')).toContainText('planning buffers');
    } else await expect(page.locator('.route-map-hero .google-map-surface')).toHaveAttribute('data-route-mode',transport);
  }
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, document.body.scrollHeight); });
    const actions = page.locator('.itinerary-sticky-actions');
    await expect(actions).toBeVisible();
    const bar = await actions.boundingBox(), nav = await page.locator('.bottom-tabs').boundingBox();
    expect(bar.y+bar.height).toBeLessThanOrEqual(nav.y+1);
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x+bar.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`sticky-actions-${width}.png`)});
  }
});

test('inline stop panels keep one open, preserve the map, and expose all venue actions', async ({page}, info) => {
  const detailed = { ...plan.stops[0], image:'/test-venue.png', note:'A quiet bookshop with independent titles.', reason:'An indie bookshop close to your other stops.', website:'https://example.com/bookshop' };
  await page.route('**/test-venue.png', route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#e5edda"/></svg>'}));
  await page.addInitScript(stop => {
    const bundle = JSON.parse(localStorage.getItem('melloway.current'));
    bundle.plan.stops[0] = stop;
    localStorage.setItem('melloway.current', JSON.stringify(bundle));
  }, detailed);
  let routeRequests = 0;
  page.on('request',request=>{ if (request.url().includes('/api/itinerary-routes')) routeRequests++; });
  await page.goto('/itinerary');
  await expect(page.locator('.map-preview .google-map-canvas')).toHaveAttribute('data-map-state','ready');
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'view stop cards',exact:true})).toHaveCount(0);
  await page.locator('.map-preview .google-map-canvas').evaluate(el=>{ window.originalRouteMap=el; });
  const requestsBefore = routeRequests;
  const row = page.getByRole('button',{name:`view ${detailed.name} details`,exact:true});
  await row.click();
  const panel = page.getByRole('region',{name:`${detailed.name} stop details`,exact:true});
  await expect(panel).toBeVisible();
  await expect(panel.locator('img')).toBeVisible();
  await expect(panel).toContainText(detailed.note);
  await expect(panel).toContainText(detailed.reason);
  await expect(panel).toContainText('9:00 am–10:00 pm');
  await expect(panel).toContainText(`~$${detailed.cost} each`);
  await expect(panel).toContainText('30 min');
  await expect(panel.getByRole('link',{name:'View Details',exact:true})).toHaveAttribute('href',`/venue/${detailed.id}`);
  const direction = new URL(await panel.getByRole('link',{name:'Directions',exact:true}).getAttribute('href'));
  expect(direction.searchParams.get('destination')).toBe(`${detailed.lat},${detailed.lng}`);
  expect(direction.searchParams.get('origin')).toBeNull();
  expect(direction.searchParams.get('travelmode')).toBe('walking');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('inline-itinerary.png'),fullPage:true});
  await page.getByRole('button',{name:'view Fixture bookshop b details',exact:true}).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.inline-stop-expansion')).toHaveCount(1);
  await expect(row).toHaveAttribute('aria-expanded','false');
  await page.locator('.map-preview .route-pin').first().click();
  await expect(panel).toBeVisible();
  expect(await page.locator('.map-preview .google-map-canvas').evaluate(el=>el===window.originalRouteMap)).toBe(true);
  expect(routeRequests).toBe(requestsBefore);
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await panel.screenshot({path:info.outputPath(`inline-stop-${width}.png`)});
  }
  await panel.getByRole('button',{name:'Replace Stop',exact:true}).click();
  const picker=page.getByRole('dialog');
  await expect(picker).toBeVisible();
  await picker.getByLabel('search available spots').fill('Fixture bookshop d');
  await picker.getByRole('button',{name:'choose Fixture bookshop d',exact:true}).click();
  await expect.poll(async()=>(await storedPlan(page)).stops[0].id).toBe('edit-d');
  await page.getByRole('button',{name:'view Fixture bookshop d details',exact:true}).click();
  await page.getByRole('region',{name:'Fixture bookshop d stop details',exact:true}).getByRole('button',{name:'Remove Stop',exact:true}).click();
  await expect(page.locator('.route-summary-list > li')).toHaveCount(2);
  await page.getByRole('button',{name:'view Fixture bookshop b details',exact:true}).click();
  await page.getByRole('region',{name:'Fixture bookshop b stop details',exact:true}).getByRole('button',{name:'Remove Stop',exact:true}).click();
  await expect(page.locator('.route-summary-list > li')).toHaveCount(1);
  await page.getByRole('button',{name:'view Fixture bookshop c details',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove Stop',exact:true})).toBeDisabled();
});
