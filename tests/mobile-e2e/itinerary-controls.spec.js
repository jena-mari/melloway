import { test, expect } from '@playwright/test';

const prefs = { mode:'date', name:'Tester', age:21, gender:'Prefer not to say', companion:'Partner', partner:'', area:'Sydney CBD', budget:100,
  date:'2026-10-12', time:'11:00', transport:'Walking', duration:8, preferences:['Bookshops'], notes:'' };
const candidates = ['a','b','c'].map((id,i) => ({ id:`native-${id}`,name:`Native fixture ${id}`,address:'Fixture Sydney address',lat:-33.87-i*.001,lng:151.208+i*.001,
  source:'demo',category:'Bookshops',tags:['Bookshops'],score:10,cost:10,mins:30,hours:{open:540,close:1320} }));
const matrix = [[0,30,1],[2,0,30],[30,1,0]].map(row=>row.map(minutes=>({minutes,distance:.1,source:'estimate'})));
const plan = {id:'native-edit-plan',prefs,stops:candidates.map((s,i)=>({...s,arrival:660+i*60,travelFromPrevious:i?matrix[i-1][i]:null})),
  cost:30,transportAllowance:0,travel:60,elapsed:150,distance:.2,source:'estimate',notice:'Offline fixture.'};
const read = page => page.evaluate(()=>JSON.parse(localStorage.getItem('melloway.mobile.v1')).state);
test.beforeEach(async ({page})=>{
  await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(stored=>{
    if (!localStorage.getItem('melloway.mobile.v1')) localStorage.setItem('melloway.mobile.v1',JSON.stringify(stored));
  },{state:{draft:prefs,current:{plan,candidates,matrix,notice:plan.notice},saved:[]},version:1});
});

test('native controls edit time, preserve records, reorder letters and switch transport',async ({page},info)=>{
  await page.goto('/itinerary');
  await page.getByRole('button',{name:'edit Native fixture a timeframe',exact:true}).click();
  await page.getByLabel('arrive at (HH:MM)').fill('12:00');
  await page.getByLabel('visit length in minutes').fill('120');
  await page.getByRole('button',{name:'save timeframe',exact:true}).click();
  await expect(page.getByLabel('arrive at (HH:MM)')).toHaveCount(0);
  const edited=(await read(page)).current.plan;
  expect(edited.stops[0].arrival).toBe(720);
  expect(edited.stops[0].mins).toBe(120);
  expect(edited.stops[1].arrival).toBeGreaterThanOrEqual(840);
  await page.getByRole('button',{name:'lock this in',exact:true}).click();
  await expect.poll(async()=> (await read(page)).saved.length).toBe(1);
  await page.getByRole('button',{name:'edit stops',exact:true}).click();
  await page.getByRole('button',{name:'move Native fixture b down',exact:true}).click();
  await expect.poll(async()=> (await read(page)).current.plan.stops[1].id).toBe('native-c');
  await expect(page.getByRole('button',{name:'B. Native fixture c',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'view Native fixture c details',exact:true}).click();
  await page.getByRole('button',{name:'View Details · Native fixture c',exact:true}).click();
  await expect(page.getByText('STOP B · LOCATION SPOTLIGHT',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'back to ur day',exact:true}).click();
  expect((await read(page)).saved[0].stops).toEqual(edited.stops);
  await page.getByRole('radio',{name:'Driving',exact:true}).click();
  await expect.poll(async()=> (await read(page)).current.plan.prefs.transport).toBe('Driving');
  await page.getByRole('radio',{name:'Not selected',exact:true}).click();
  await expect.poll(async()=> (await read(page)).current.plan.prefs.transport).toBe('Not selected');
  await page.reload();
  expect((await read(page)).current.plan.stops[0].arrivalOverride).toBe(720);
  await page.screenshot({path:info.outputPath('native-controls-preview.png')});
});

test('native shuffle retains every venue and an invalid timeframe leaves the route intact',async ({page})=>{
  await page.goto('/itinerary');
  await page.getByRole('button',{name:'shuffle route',exact:true}).click();
  await expect.poll(async()=> (await read(page)).current.plan.stops.map(s=>s.id).join(',')).not.toBe('native-a,native-b,native-c');
  const shuffled=(await read(page)).current.plan;
  expect(shuffled.stops.map(s=>s.id).sort()).toEqual(['native-a','native-b','native-c']);
  const name=shuffled.stops[0].name;
  await page.getByRole('button',{name:`edit ${name} timeframe`,exact:true}).click();
  await page.getByLabel('arrive at (HH:MM)').fill('06:00');
  await page.getByRole('button',{name:'save timeframe',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('conflicts');
  expect((await read(page)).current.plan.stops).toEqual(shuffled.stops);
  await page.getByRole('button',{name:'cancel',exact:true}).click();
});


test('native basic details expand one stop at a time and map selection stays inline', async ({page})=>{
  await page.goto('/itinerary');
  await expect(page.getByRole('button',{name:/^View Details ·/})).toHaveCount(0);
  const a=page.getByRole('button',{name:'view Native fixture a details',exact:true});
  const b=page.getByRole('button',{name:'view Native fixture b details',exact:true});
  await a.click();
  await expect(a).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('button',{name:'View Details · Native fixture a',exact:true})).toBeVisible();
  await expect(page.getByText('recommended visit · 30 min',{exact:true})).toBeVisible();
  await expect(page.getByText(/opening hours · 9:00 am–10:00 pm/)).toBeVisible();
  await b.click();
  await expect(a).toHaveAttribute('aria-expanded','false');
  await expect(page.getByRole('button',{name:/^View Details ·/})).toHaveCount(1);
  await page.getByRole('button',{name:'A. Native fixture a',exact:true}).click();
  await expect(a).toHaveAttribute('aria-expanded','true');
  await expect(b).toHaveAttribute('aria-expanded','false');
  await expect(page.getByRole('button',{name:'Replace Stop · Native fixture a',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Remove Stop · Native fixture a',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Directions · Native fixture a',exact:true})).toBeVisible();
  await a.click();
  await expect(page.getByRole('button',{name:/^View Details ·/})).toHaveCount(0);
  await expect(page).toHaveURL(/\/itinerary$/);
  expect((await read(page)).current.plan.id).toBe(plan.id);
});
