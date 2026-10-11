import { test, expect } from '@playwright/test';
import { defaultDraft, generateItinerary } from '@melloway/domain';

const next = page => page.getByRole('button', { name: 'continue', exact: true }).click();
const skip = page => page.getByRole('button', { name: 'lemme skip this +', exact: true }).click();
async function reachBudget(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'a date ♡', exact: true }).click();
  await page.getByRole('textbox', { name: 'what’s ur name?', exact: true }).fill('Alex');
  await next(page); await next(page); await next(page); await next(page); await next(page);
  await page.getByRole('textbox', { name: 'Sydney starting area', exact: true }).fill('Sydney CBD');
  await page.getByRole('button', { name: 'choose Sydney CBD', exact: true }).click();
  await next(page);
  await expect(page).toHaveURL(/step=details&q=3/);
}

test('main’s short onboarding reaches a plan, venue, saving/reloading, swap and regeneration', async ({ page }) => {
  await reachBudget(page);
  await page.getByRole('textbox', { name: 'budget each', exact: true }).fill('201');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('$0 to $200');
  await page.getByRole('button', { name: '$80', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: 'Next idea', exact: true }).click();
  await expect(page.getByText('vintage finds + cute photos', { exact: true })).toBeVisible();
  await next(page);
  await page.getByRole('button', { name: 'Brunch', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: 'Cozy', exact: true }).click();
  await next(page);
  await page.getByRole('textbox', { name: 'anything else for ur plan?', exact: true }).fill('a quiet afternoon');
  await page.getByRole('button', { name: 'submit', exact: true }).click();
  await expect(page).toHaveURL(/\/itinerary$/, { timeout: 30000 });
  await page.getByRole('button', { name: /^the details ·/ }).first().click();
  await expect(page).toHaveURL(/\/venue\//);
  await page.getByRole('button', { name: 'back to ur day', exact: true }).click();
  await page.getByRole('button', { name: 'lock this in', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'saved ♡', exact: true })).toBeVisible();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.mobile.v1')).state);
  expect(persisted.draft.name).toBe('Alex');
  expect(persisted.onboarding.diningVibes).toEqual(['Cozy']);
  expect(persisted.onboarding.notes).toBe('a quiet afternoon');
  expect(persisted.saved).toHaveLength(1);
  await page.getByRole('button', { name: 'swap this stop ↻', exact: true }).first().click();
  await expect(page.getByText(/One new stop|No replacement fits/)).toBeVisible();
  await page.getByRole('button', { name: 'try another plan ↻', exact: true }).click();
  await expect(page.getByText(/A fresh plan|No other plan fits/)).toBeVisible();
});

test('optional details keep actual Back history, calendar/time choices and reloadable answers', async ({ page }) => {
  await reachBudget(page);
  await page.getByRole('button', { name: /^a few more details,/ }).click();
  await page.getByRole('textbox', { name: 'their name (optional)', exact: true }).fill('Sam');
  await next(page);
  await page.getByRole('button', { name: 'tomorrow', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: 'afternoon, 2 pm', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: 'Public transport', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: '6 hours', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: 'back', exact: true }).click();
  await expect(page).toHaveURL(/step=details&q=8/);
  await page.reload();
  await expect(page.getByRole('button', { name: '6 hours', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.mobile.v1')).state);
  expect(state.draft.partner).toBe('Sam');
  expect(state.onboarding.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(state.onboarding.time).toBe('14:00');
  expect(state.onboarding.timeExplicit).toBe(true);
  expect(state.draft.transport).toBe('Public transport');
  await page.getByRole('button', { name: 'back', exact: true }).click();
  await expect(page).toHaveURL(/step=details&q=7/);
});

test('optional day and time can be skipped and a no-feasible plan is recoverable', async ({ page }) => {
  await reachBudget(page);
  await page.getByRole('button', { name: 'free', exact: true }).click();
  await page.getByRole('button', { name: /^a few more details,/ }).click();
  await next(page);
  await skip(page);
  await expect(page).toHaveURL(/step=details&q=6/);
  await skip(page);
  await page.getByRole('button', { name: 'Driving', exact: true }).click();
  await next(page); await next(page); await next(page);
  await skip(page); await skip(page); await skip(page);
  await expect(page).toHaveURL(/\/generating$/);
  await expect(page.getByText('No three-stop plan fits those hours, area and budget. Try an earlier start, longer duration, or wider area.')).toBeVisible();
  await page.getByRole('button', { name: 'tweak the details', exact: true }).click();
  await expect(page).toHaveURL(/\/preferences$/);
});

test('an unselected location is blocked, while skipping the area still finishes the journey', async ({ page }) => {
  await page.goto('/onboarding?step=details&q=2');
  await page.getByRole('textbox', { name: 'Sydney starting area', exact: true }).fill('Newto');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('Choose a suggestion');
  await skip(page);
  await expect(page).toHaveURL(/step=vibes/);
  await next(page); await skip(page); await skip(page); await skip(page);
  await expect(page).toHaveURL(/\/itinerary$/, { timeout: 30000 });
  await expect(page.getByText(/Anywhere in Sydney/).first()).toBeVisible();
});

test('an existing device draft and saved plan survive the added onboarding answer fields', async ({ page }) => {
  const draft = { ...defaultDraft(), name: 'Existing', budget: 120 };
  const current = await generateItinerary(draft, { createId: () => 'existing-saved-plan' });
  expect(current.plan).not.toBeNull();
  const snapshot = JSON.stringify({ version: 1, state: { draft, current, saved: [current.plan] } }, (key, value) => key === 'minutes' && value === Infinity ? 'unreachable' : value);
  await page.addInitScript(value => { if (!localStorage.getItem('melloway.mobile.v1')) localStorage.setItem('melloway.mobile.v1', value); }, snapshot);
  await page.goto('/onboarding?step=profile');
  await expect(page.getByRole('textbox', { name: 'what’s ur name?', exact: true })).toHaveValue('Existing');
  await page.getByRole('textbox', { name: 'what’s ur name?', exact: true }).fill('Updated');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'what’s ur name?', exact: true })).toHaveValue('Updated');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('melloway.mobile.v1')).state);
  expect(persisted.saved.map(plan => plan.id)).toEqual(['existing-saved-plan']);
  expect(persisted.current.plan.id).toBe('existing-saved-plan');
  expect(persisted.draft.budget).toBe(120);
  expect(persisted.onboarding.notes).toBe('');
});
