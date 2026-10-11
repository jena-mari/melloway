import { test, expect } from '@playwright/test';
import { defaultDraft, generateItinerary } from '@melloway/domain';

const tiktok = 'https://tiktok.com/@prototype/video/1234567890123456789?share=1';
const instagram = 'https://instagram.com/reel/Prototype_Reel-1/?igsh=test';
const confirmation = 'Confirm this video features this place';
test.beforeEach(async ({ page }) => {
  await page.route('https://www.tiktok.com/player/v1/**', route => route.fulfill({
    contentType: 'text/html', body: '<p>Mock TikTok prototype preview</p>',
  }));
  await page.route('https://www.instagram.com/reel/*/embed/', route => route.fulfill({
    contentType: 'text/html', body: '<p>Mock Instagram prototype preview</p>',
  }));
});
async function preview(page, url) {
  await page.getByRole('button', { name: 'Add video', exact: true }).click();
  await page.getByRole('textbox', { name: 'Video link', exact: true }).fill(url);
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
}
async function save(page, url) {
  await preview(page, url);
  await page.getByRole('checkbox', { name: confirmation, exact: true }).click();
  await page.getByRole('button', { name: 'Save video to this venue', exact: true }).click();
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(1);
}

test('confirmed video persists for its venue across reload without changing plans or favourites', async ({ page }) => {
  const draft = defaultDraft();
  const current = await generateItinerary(draft, { seed: 0, createId: () => 'kept-plan' });
  expect(current.plan).not.toBeNull();
  const stored = JSON.stringify({ state: { draft, current, saved: [current.plan] }, version: 1 });
  await page.addInitScript(value => {
    if (!localStorage.getItem('melloway.mobile.v1')) localStorage.setItem('melloway.mobile.v1', value);
  }, stored);
  await page.goto('/venue/carriageworks');
  await expect(page.getByRole('heading', { name: 'Carriageworks Farmers Market', exact: true })).toBeVisible();
  await expect(page.getByText(/Device-local prototype videos/)).toBeVisible();
  await preview(page, tiktok);
  await expect(page).toHaveURL(/\/venue\/carriageworks$/);
  const saveButton = page.getByRole('button', { name: 'Save video to this venue', exact: true });
  await expect(saveButton).toBeDisabled();
  await expect(page.frameLocator('iframe').getByText('Mock TikTok prototype preview')).toBeVisible();
  await page.getByRole('checkbox', { name: confirmation, exact: true }).click();
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Video link', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(1);
  const data = await page.evaluate(() => ({
    associations: JSON.parse(localStorage.getItem('melloway.venue-videos.v1')),
    plans: localStorage.getItem('melloway.mobile.v1'),
  }));
  expect(data.plans).toBe(stored);
  expect(data.associations).toEqual([{ venueId: 'carriageworks', platform: 'tiktok', postId: '1234567890123456789',
    normalizedUrl: 'https://www.tiktok.com/@prototype/video/1234567890123456789', savedAt: expect.any(String) }]);
  expect(Number.isFinite(Date.parse(data.associations[0].savedAt))).toBe(true);
  await page.goto('/venue/brunch-sh');
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(0);
  await expect(page.getByText('No videos saved for this venue yet.')).toBeVisible();
});

test('Instagram save reuses preview and original-link fallback when playback is unavailable', async ({ page }) => {
  await page.route('https://www.instagram.com/reel/*/embed/', route => route.fulfill({
    contentType: 'text/html', body: '<p>Mock unavailable video</p>',
  }));
  await page.route('https://www.instagram.com/reel/Prototype_Reel-1/', route => route.fulfill({
    contentType: 'text/html', body: 'Mock original Reel page',
  }));
  await page.goto('/venue/carriageworks');
  await save(page, instagram);
  await expect(page.getByTestId('saved-venue-video').getByText('https://www.instagram.com/reel/Prototype_Reel-1/', { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe').getByText('Mock unavailable video')).toBeVisible();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in Instagram', exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL('https://www.instagram.com/reel/Prototype_Reel-1/');
  await popup.close();
});

test('invalid links are rejected and changing a checked link clears confirmation', async ({ page }) => {
  await page.goto('/venue/carriageworks');
  await preview(page, 'https://vm.tiktok.com.evil.test/short/');
  await expect(page.getByRole('alert')).toContainText('Paste a TikTok video/share link or Instagram Reel link.');
  await expect(page.getByRole('checkbox', { name: confirmation })).toHaveCount(0);
  const input = page.getByRole('textbox', { name: 'Video link', exact: true });
  await input.fill(instagram);
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await page.getByRole('checkbox', { name: confirmation, exact: true }).click();
  await input.fill(tiktok);
  await expect(page.getByRole('button', { name: 'Save video to this venue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: confirmation, exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Save video to this venue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel adding video', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Video link' })).toHaveCount(0);
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(0);
});

test('duplicate post IDs are rejected for one venue but allowed for another', async ({ page }) => {
  await page.goto('/venue/carriageworks');
  await save(page, tiktok);
  await preview(page, 'https://www.tiktok.com/@otheruser/video/1234567890123456789#samepost');
  await page.getByRole('checkbox', { name: confirmation, exact: true }).click();
  await page.getByRole('button', { name: 'Save video to this venue', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('This video is already saved for this venue.');
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(1);
  await page.goto('/venue/brunch-sh');
  await save(page, tiktok);
  await page.reload();
  await expect(page.getByTestId('saved-venue-video')).toHaveCount(1);
});

test('unknown venues do not offer an Add video flow', async ({ page }) => {
  await page.goto('/venue/unknown-venue');
  await expect(page.getByText('that spot has wandered off.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add video', exact: true })).toHaveCount(0);
});
