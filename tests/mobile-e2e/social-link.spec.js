import { test, expect } from '@playwright/test';

const apiHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };

// Provider pages are external; keep form tests independent of their availability.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/social-link', route => route.fulfill(route.request().method() === 'OPTIONS'
    ? { status: 204, headers: apiHeaders }
    : { status: 502, headers: apiHeaders, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture link unavailable' }) }));
  await page.route('https://www.tiktok.com/player/v1/**', route => route.fulfill({
    contentType: 'text/html', body: '<button>Play test video</button>',
  }));
  await page.route('https://www.instagram.com/reel/*/embed/', route => route.fulfill({
    contentType: 'text/html', body: '<button>Play test Reel</button>',
  }));
});

test('home opens the form and a TikTok submission shows its cleaned URL and exact ID', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'paste a TikTok or Reel link', exact: true }).click();
  await expect(page).toHaveURL(/\/social-link$/);
  await page.getByRole('textbox', { name: 'Video link', exact: true }).fill(
    'https://tiktok.com/@scout2015/video/6718335390845095173/?is_from_webapp=1#player',
  );
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  const result = page.getByTestId('social-link-result');
  await expect(result.getByText('TikTok', { exact: true })).toBeVisible();
  await expect(result.getByText('6718335390845095173', { exact: true })).toBeVisible();
  await expect(result.getByText('https://www.tiktok.com/@scout2015/video/6718335390845095173', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const player = page.locator('iframe[title="TikTok video preview"]');
  await expect(player).toHaveAttribute('src', 'https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0&controls=1');
  await expect(page.frameLocator('iframe').getByRole('button', { name: 'Play test video' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open in TikTok' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'a date ♡', exact: true })).toBeVisible();
});

test('Instagram submission also works with the keyboard submit action', async ({ page }) => {
  await page.goto('/social-link');
  const input = page.getByRole('textbox', { name: 'Video link', exact: true });
  await input.fill(' https://instagram.com/reel/DJf0_RmSd-T?igsh=abc ');
  await input.press('Enter');
  const result = page.getByTestId('social-link-result');
  await expect(result.getByText('Instagram', { exact: true })).toBeVisible();
  await expect(result.getByText('DJf0_RmSd-T', { exact: true })).toBeVisible();
  await expect(result.getByText('https://www.instagram.com/reel/DJf0_RmSd-T/', { exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="Instagram video preview"]')).toHaveAttribute('src', 'https://www.instagram.com/reel/DJf0_RmSd-T/embed/');
  await expect(page.frameLocator('iframe').getByRole('button', { name: 'Play test Reel' })).toBeVisible();
});

for (const [label, url] of [
  ['invalid text', 'not a URL'],
  ['an unsupported platform', 'https://www.youtube.com/watch?v=abc'],
]) {
  test(`submitting ${label} shows an error instead of a result`, async ({ page }) => {
    await page.goto('/social-link');
    await page.getByRole('textbox', { name: 'Video link', exact: true }).fill(url);
    await page.getByRole('button', { name: 'Check link', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Paste a TikTok video/share link or Instagram Reel link.');
    await expect(page.getByTestId('social-link-result')).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(0);
  });
}

test('an empty submission asks for a link and editing clears the error', async ({ page }) => {
  await page.goto('/social-link');
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Paste a link first.');
  await page.getByRole('textbox', { name: 'Video link', exact: true }).fill('https://instagram.com/reel/DJf0_RmSd-T/');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('social-link-result')).toHaveCount(0);
});

for (const shared of ['https://vt.tiktok.com/ZSbv9H449/', 'https://vm.tiktok.com/ABC123/', 'https://www.tiktok.com/t/ABC123/']) {
  test(`a copied share link resolves before preview: ${shared}`, async ({ page }) => {
    await page.route('**/api/social-link', async route => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      expect(route.request().postDataJSON()).toEqual({ url: shared });
      await route.fulfill({ headers: apiHeaders, contentType: 'application/json', body: JSON.stringify({ video: {
        platform: 'tiktok', id: '7691143357531311391',
        normalizedUrl: 'https://www.tiktok.com/@daisypyo/video/7691143357531311391',
      } }) });
    });
    await page.goto('/social-link');
    await page.getByRole('textbox', { name: 'Video link', exact: true }).fill(shared);
    await page.getByRole('button', { name: 'Check link', exact: true }).click();
    await expect(page.getByTestId('social-link-result').getByText('7691143357531311391', { exact: true })).toBeVisible();
    await expect(page.locator('iframe[title="TikTok video preview"]')).toHaveAttribute('src',
      'https://www.tiktok.com/player/v1/7691143357531311391?autoplay=0&controls=1');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('the copied photo slideshow link previews its post ID and keeps the photo URL', async ({ page }) => {
  const normalizedUrl = 'https://www.tiktok.com/@nabooresident/photo/7666580140201217311';
  await page.route('**/api/social-link', async route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    expect(route.request().postDataJSON()).toEqual({ url: 'https://vt.tiktok.com/ZSbvXpjdm/' });
    await route.fulfill({ headers: apiHeaders, contentType: 'application/json', body: JSON.stringify({ video: {
      platform: 'tiktok', id: '7666580140201217311', normalizedUrl,
    } }) });
  });
  await page.goto('/social-link');
  await page.getByRole('textbox', { name: 'Video link', exact: true }).fill('https://vt.tiktok.com/ZSbvXpjdm/');
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await expect(page.getByTestId('social-link-result').getByText(normalizedUrl, { exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="TikTok video preview"]')).toHaveAttribute('src',
    'https://www.tiktok.com/player/v1/7666580140201217311?autoplay=0&controls=1');
  await expect(page.getByRole('button', { name: 'Open in TikTok', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed share resolution offers a retry and never shows a stale player', async ({ page }) => {
  await page.goto('/social-link');
  await page.getByRole('textbox', { name: 'Video link', exact: true }).fill('https://vt.tiktok.com/UNAVAILABLE/');
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('TikTok could not resolve this share link (HTTP 502).');
  await expect(page.getByTestId('social-video-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check link', exact: true })).toBeEnabled();
});

test('editing during a share lookup discards the old response', async ({ page }) => {
  let requested;
  const started = new Promise(resolve => { requested = resolve; });
  let complete;
  const release = new Promise(resolve => { complete = resolve; });
  await page.route('**/api/social-link', async route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    requested();
    await release;
    await route.fulfill({ headers: apiHeaders, contentType: 'application/json', body: JSON.stringify({ video: {
      platform: 'tiktok', id: '7691143357531311391',
      normalizedUrl: 'https://www.tiktok.com/@daisypyo/video/7691143357531311391',
    } }) }).catch(() => {});
  });
  await page.goto('/social-link');
  const input = page.getByRole('textbox', { name: 'Video link', exact: true });
  await input.fill('https://vt.tiktok.com/ZSbv9H449/');
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await started;
  await input.fill('https://instagram.com/reel/DJf0_RmSd-T/');
  complete();
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await expect(page.getByTestId('social-link-result').getByText('Instagram', { exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="TikTok video preview"]')).toHaveCount(0);
});

test('editing a valid submission removes stale metadata before another check', async ({ page }) => {
  await page.goto('/social-link');
  const input = page.getByRole('textbox', { name: 'Video link', exact: true });
  const check = page.getByRole('button', { name: 'Check link', exact: true });
  await input.fill('https://instagram.com/reel/DJf0_RmSd-T/');
  await check.click();
  await expect(page.getByTestId('social-link-result')).toBeVisible();
  await input.fill('https://vm.tiktok.com/ABC123/');
  await expect(page.getByTestId('social-link-result')).toHaveCount(0);
  await expect(page.getByTestId('social-video-preview')).toHaveCount(0);
  await check.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await input.fill('https://www.tiktok.com/@scout2015/video/6718335390845095173');
  await check.click();
  await expect(page.getByTestId('social-link-result').getByText('TikTok', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('iframe[title="TikTok video preview"]')).toBeVisible();
});

test('the original link remains available when the provider cannot show the video', async ({ page }) => {
  await page.route('https://www.tiktok.com/player/v1/**', route => route.fulfill({
    contentType: 'text/html', body: '<p>Video unavailable</p>',
  }));
  await page.goto('/social-link');
  await page.getByRole('textbox', { name: 'Video link', exact: true }).fill('https://www.tiktok.com/@scout2015/video/6718335390845095173');
  await page.getByRole('button', { name: 'Check link', exact: true }).click();
  await expect(page.frameLocator('iframe').getByText('Video unavailable')).toBeVisible();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in TikTok', exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL('https://www.tiktok.com/@scout2015/video/6718335390845095173');
  await popup.close();
});
