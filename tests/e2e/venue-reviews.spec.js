import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { editorialPicks } from '../../src/data/editorialPicks.js';
import { sydneyVenues } from '../../src/data/sydneyVenues.js';
import { googleMapsFixture } from './google-maps-fixture.js';
import { reviewStorageKey } from '../../src/services/venueReviews.js';

const first = editorialPicks[0], glebe = editorialPicks.find(venue => venue.id === 'sydney-glebe-markets');
const section = page => page.locator('.venue-reviews');
const form = page => page.locator('.venue-review-dialog');
async function mockReviews(page) {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api/maps/config'
    ? route.fulfill({ json: { apiKey: 'offline-fixture', mapId: 'offline-fixture' } })
    : route.fulfill({ status: 503, json: { error: 'Providers disabled in review fixture' } }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.fulfill({ contentType: 'text/javascript', body: googleMapsFixture }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
}
async function openPick(page, venue = first) {
  await page.goto(`/explore?place=${venue.id}`);
  await page.getByRole('button', { name: `view ${venue.name} details`, exact: true }).click();
  await expect(section(page)).toBeVisible();
}
async function newReview(page, { rating, comment, name = 'Test reviewer' }) {
  await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await form(page).getByLabel('display name', { exact: true }).fill(name);
  if (rating) await form(page).getByRole('radio', { name: `${rating} ${rating === 1 ? 'star' : 'stars'}`, exact: true }).check();
  if (comment) await form(page).getByLabel('comment (optional)', { exact: true }).fill(comment);
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(form(page)).toHaveCount(0);
}
const imageInput = page => form(page).locator('input[type=file]');
async function png() {
  return { name: 'review.png', mimeType: 'image/png', buffer: await readFile(new URL('../../public/icons/optimized/green_matcha.png', import.meta.url)) };
}

test.beforeEach(async ({ page }) => { await mockReviews(page); });

test('all ten Picks expose the same device-only section; the Explore sheet keeps the social section and evidence order', async ({ page }, info) => {
  await openPick(page);
  await expect(page.locator('.pick-detail-dialog .venue-social + .venue-reviews + .editorial-evidence')).toHaveCount(1);
  await expect(section(page).getByRole('heading', { name: 'what people think' })).toBeVisible();
  await expect(section(page).getByText('No reviews here yet. Leave a little thought about this spot.')).toBeVisible();
  await expect(section(page).getByText('Reviews are saved on this device for now.')).toBeVisible();
  await expect(section(page).getByLabel('Local community rating')).toContainText('0 ratings');
  await section(page).screenshot({ path: info.outputPath('empty-local-reviews.png') });
  await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await expect(form(page).locator('input[type=url]')).toHaveCount(0);
  await expect(imageInput(page)).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  await page.keyboard.press('Escape');
  await expect(form(page)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: first.name, exact: true })).toBeVisible();
  for (const venue of editorialPicks) {
    await page.goto(`/picks/places/${venue.id}`);
    await expect(section(page)).toHaveAttribute('data-venue-id', venue.id);
    await expect(section(page).getByText('0 ratings')).toBeVisible();
  }
});

test('half-star selection, numeric averages, comment-only reviews, edits and deletes persist after refresh', async ({ page }, info) => {
  await openPick(page);
  await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await form(page).getByLabel('display name', { exact: true }).fill('Half-star tester');
  const half = form(page).getByRole('radio', { name: '0.5 stars', exact: true });
  await half.check(); await expect(half).toBeChecked();
  await expect(form(page).getByRole('img', { name: '0.5 out of 5 stars' })).toBeVisible();
  const halfFill = await form(page).locator('.venue-review-star').first().locator('span').evaluate(element => element.getBoundingClientRect().width);
  expect(halfFill).toBe(11);
  await form(page).getByRole('radio', { name: '3.5 stars', exact: true }).check();
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(section(page).getByText('1 rating', { exact: true })).toBeVisible();
  await newReview(page, { rating: 4.5, name: 'Second tester' });
  await newReview(page, { comment: 'A comment without a star rating.', name: 'Comment tester' });
  await expect(section(page).getByLabel('Local community rating')).toContainText('4/5');
  await expect(section(page).getByLabel('Local community rating')).toContainText('2 ratings');
  await expect(section(page).getByRole('article')).toHaveCount(3);
  await expect(section(page).getByText('Comment only', { exact: true })).toBeVisible();
  await expect(section(page).locator('time')).toHaveCount(3);
  await section(page).screenshot({ path: info.outputPath('local-review-cards.png') });
  await page.reload();
  await page.getByRole('button', { name: `view ${first.name} details`, exact: true }).click();
  await expect(section(page).getByRole('article')).toHaveCount(3);
  await section(page).getByRole('button', { name: 'edit review by Half-star tester' }).click();
  await expect(form(page).getByRole('radio', { name: '3.5 stars', exact: true })).toBeChecked();
  await form(page).getByRole('radio', { name: '0.5 stars', exact: true }).check();
  await form(page).getByLabel('comment (optional)', { exact: true }).fill('Updated locally.');
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(section(page).getByLabel('Local community rating')).toContainText('2.5/5');
  await section(page).getByRole('button', { name: 'delete review by Second tester' }).click();
  await expect(section(page).getByLabel('Local community rating')).toContainText('0.5/5');
  await expect(section(page).getByLabel('Local community rating')).toContainText('1 rating');
  await page.reload();
  await page.getByRole('button', { name: `view ${first.name} details`, exact: true }).click();
  await expect(section(page).getByText('Updated locally.', { exact: true })).toBeVisible();
  await expect(section(page).getByRole('article')).toHaveCount(2);
  await expect(section(page).getByText('Second tester', { exact: true })).toHaveCount(0);
});

test('PNG and WebP photos are compressed into IndexedDB, previewed, removed, persisted, edited and deleted', async ({ page }, info) => {
  await openPick(page);
  await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await form(page).getByLabel('comment (optional)', { exact: true }).fill('A photo review on this device.');
  const webp = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1000;
    const context = canvas.getContext('2d'); context.fillStyle = '#7a8b65'; context.fillRect(0, 0, 1800, 1000);
    return canvas.toDataURL('image/webp').split(',')[1];
  });
  const images = [await png(), { name: 'second.webp', mimeType: 'image/webp', buffer: Buffer.from(webp, 'base64') }];
  await imageInput(page).setInputFiles(images);
  await expect(form(page).getByAltText('Review photo preview 2')).toBeVisible();
  await imageInput(page).setInputFiles(await png());
  await expect(form(page).getByRole('alert')).toContainText('up to 2');
  await form(page).getByRole('button', { name: 'remove photo 1' }).click();
  await expect(form(page).locator('.venue-review-photo-previews img')).toHaveCount(1);
  await imageInput(page).setInputFiles(await png());
  await expect(form(page).locator('.venue-review-photo-previews img')).toHaveCount(2);
  await form(page).screenshot({ path: info.outputPath('local-review-form.png') });
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(section(page).locator('.venue-review-photos img')).toHaveCount(2);
  const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).reviews[0], reviewStorageKey(first.id));
  expect(record.photoIds).toHaveLength(2);
  expect(JSON.stringify(record)).not.toContain('data:image');
  const photos = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('melloway-review-photos', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const records = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close();
    return Promise.all(records.map(async record => { const image = await createImageBitmap(record.blob); const result = { type: record.blob.type, size: record.blob.size, width: image.width, height: image.height }; image.close(); return result; }));
  });
  expect(photos).toHaveLength(2);
  for (const photo of photos) { expect(photo.type).toBe('image/jpeg'); expect(photo.size).toBeLessThanOrEqual(500 * 1024); expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(1280); }
  await page.reload(); await page.getByRole('button', { name: `view ${first.name} details`, exact: true }).click();
  await expect.poll(() => section(page).locator('.venue-review-photos img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await section(page).getByRole('button', { name: 'edit review by You' }).click();
  await expect(form(page).getByAltText('Review photo preview 2')).toBeVisible();
  await form(page).getByRole('button', { name: 'remove photo 1' }).click();
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(section(page).locator('.venue-review-photos img')).toHaveCount(1);
  await section(page).getByRole('button', { name: 'delete review by You' }).click();
  await expect(section(page).getByRole('article')).toHaveCount(0);
  const remaining = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('melloway-review-photos', 1); request.onsuccess = () => resolve(request.result); });
    const count = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return count;
  });
  expect(remaining).toBe(0);
});

test('ordinary venues reuse stable IDs; another page sees saved reviews and other venues stay separate', async ({ page, context }) => {
  await page.goto(`/picks/places/${glebe.id}`);
  await newReview(page, { rating: 1.5, comment: 'Only the Glebe branch.', name: 'Branch tester' });
  const reopened = await context.newPage(); await mockReviews(reopened);
  await reopened.goto(`/venue/${glebe.id}`);
  await expect(section(reopened).getByText('Only the Glebe branch.', { exact: true })).toBeVisible();
  await expect(section(reopened).getByLabel('Local community rating')).toContainText('1.5/5');
  await reopened.goto(`/venue/${sydneyVenues.find(venue => venue.id !== glebe.id).id}`);
  await expect(section(reopened).getByRole('article')).toHaveCount(0);
  await page.goto(`/picks/places/${first.id}`);
  await expect(section(page).getByRole('article')).toHaveCount(0);
});

test('invalid files, corrupt images, too many files and empty submissions keep the form usable', async ({ page }) => {
  await openPick(page); await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(form(page).getByRole('alert')).toContainText('rating or a comment');
  await imageInput(page).setInputFiles({ name: 'video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await expect(form(page).getByRole('alert')).toContainText('Videos are not supported');
  await imageInput(page).setInputFiles({ name: 'renamed.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await expect(form(page).getByRole('alert')).toContainText('not a valid');
  await imageInput(page).setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) });
  await expect(form(page).getByRole('alert')).toContainText('could not be read');
  const image = await png();
  await imageInput(page).setInputFiles([image, { ...image, name: 'two.png' }, { ...image, name: 'three.png' }]);
  await expect(form(page).getByRole('alert')).toContainText('up to 2');
  await expect(form(page).locator('.venue-review-photo-previews img')).toHaveCount(0);
  await form(page).getByLabel('comment (optional)', { exact: true }).fill('x'.repeat(501));
  await expect(form(page).getByLabel('comment (optional)', { exact: true })).toHaveValue('x'.repeat(500));
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(section(page).getByRole('article')).toHaveCount(1);
  await expect(section(page).getByLabel('Local community rating')).toContainText('0 ratings');
});

test('localStorage quota failure keeps the draft, creates no saved review and rolls back photo blobs', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('melloway.venueReviews.')) throw new DOMException('Full', 'QuotaExceededError'); return set.call(this, key, value); };
  });
  await openPick(page); await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await form(page).getByLabel('comment (optional)', { exact: true }).fill('Keep this draft after failure.');
  await imageInput(page).setInputFiles(await png()); await expect(form(page).getByAltText('Review photo preview 1')).toBeVisible();
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(form(page).getByRole('alert')).toContainText('Not enough storage');
  await expect(form(page).getByLabel('comment (optional)', { exact: true })).toHaveValue('Keep this draft after failure.');
  expect(await page.evaluate(key => localStorage.getItem(key), reviewStorageKey(first.id))).toBeNull();
  const count = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('melloway-review-photos', 1); request.onsuccess = () => resolve(request.result); });
    const count = await new Promise(resolve => { const request = db.transaction('photos').objectStore('photos').count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return count;
  });
  expect(count).toBe(0);
});

test('unavailable IndexedDB rejects photos gracefully and still allows a comment-only save after removing them', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await openPick(page); await section(page).getByRole('button', { name: 'leave a review', exact: true }).click();
  await form(page).getByLabel('comment (optional)', { exact: true }).fill('Save text without photos.');
  await imageInput(page).setInputFiles(await png()); await expect(form(page).getByAltText('Review photo preview 1')).toBeVisible();
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(form(page).getByRole('alert')).toContainText('Photo storage is unavailable');
  await form(page).getByRole('button', { name: 'remove photo 1' }).click();
  await form(page).getByRole('button', { name: 'save review', exact: true }).click();
  await expect(section(page).getByText('Save text without photos.', { exact: true })).toBeVisible();
});
