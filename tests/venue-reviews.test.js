import test from 'node:test';
import assert from 'node:assert/strict';
import { createVenueReviewStore, isReviewRating, reviewStorageKey, reviewSummary } from '../src/services/venueReviews.js';
import { validateReviewImage, MAX_REVIEW_PHOTO_BYTES } from '../src/services/reviewPhotos.js';

function fixture() {
  const records = new Map(), blobs = new Map(), changed = [];
  let sequence = 0, tick = 0;
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const photos = {
    async put(entries) { entries.forEach(({ id, blob }) => blobs.set(id, blob)); },
    async get(ids) { return ids.map(id => blobs.get(id) || null); },
    async remove(ids) { ids.forEach(id => blobs.delete(id)); },
  };
  const options = { storage, photos, id: () => `test-${++sequence}`, now: () => new Date(Date.UTC(2026, 9, 11, 1, tick++)).toISOString(), notify: venueId => changed.push(venueId) };
  return { records, blobs, storage, photos, changed, options, store: createVenueReviewStore(options) };
}
const values = (rating = 3.5, comment = '') => ({ displayName: 'Local tester', rating, comment });
const photo = () => ({ blob: new Blob(['compressed-test-photo'], { type: 'image/jpeg' }) });

test('all ten half-star ratings persist as numbers; malformed and out-of-range ratings are rejected', async () => {
  const { store } = fixture();
  for (let rating = 0.5; rating <= 5; rating += 0.5) {
    assert.equal(isReviewRating(rating), true);
    const { review } = await store.save('pick-a', values(rating));
    assert.equal(review.rating, rating);
  }
  assert.equal(store.list('pick-a').length, 10);
  for (const invalid of [0, 0.25, 3.1, 5.5, '3.5', NaN, Infinity]) {
    assert.equal(isReviewRating(invalid), false);
    await assert.rejects(store.save('pick-a', values(invalid)), /half-star/);
  }
  assert.equal(store.list('pick-a').length, 10);
});

test('averages and counts include submitted numeric ratings only, including half stars', () => {
  assert.deepEqual(reviewSummary([]), { count: 0, average: null });
  assert.deepEqual(reviewSummary([{ rating: 0.5 }, { rating: 3.5 }, { rating: null }, { rating: '5' }, { rating: NaN }]), { count: 2, average: 2 });
  assert.equal(reviewSummary([{ rating: 3.5 }, { rating: 4 }, { rating: 5 }]).average, 12.5 / 3);
});

test('comment-only and rating-only reviews work; empty, photos-only and overlong entries do not', async () => {
  const { store, blobs } = fixture();
  await store.save('a', values(null, '  A quiet corner.  '));
  await store.save('a', values(0.5));
  assert.equal(store.list('a')[1].comment, 'A quiet corner.');
  assert.equal(store.list('a')[1].rating, null);
  assert.deepEqual(reviewSummary(store.list('a')), { count: 1, average: 0.5 });
  await store.save('a', values(null, 'x'.repeat(500)));
  await assert.rejects(store.save('a', values(null, 'x'.repeat(501))), /500/);
  await assert.rejects(store.save('a', { ...values(null, ' '), photos: [photo()] }), /rating or a comment/);
  await assert.rejects(store.save('a', { ...values(), displayName: '' }), /display name/);
  assert.equal(blobs.size, 0);
});

test('stable venue IDs separate reviews and a fresh store reads persisted records without mutating them', async () => {
  const { store, options } = fixture();
  await store.save('same-name-branch-a', values(3.5, 'First branch'));
  await store.save('same-name-branch-b', values(0.5, 'Other branch'));
  const reopened = createVenueReviewStore(options);
  assert.equal(reopened.list('same-name-branch-a')[0].comment, 'First branch');
  assert.equal(reopened.list('same-name-branch-b')[0].rating, 0.5);
  reopened.list('same-name-branch-a')[0].rating = 5;
  assert.equal(reopened.list('same-name-branch-a')[0].rating, 3.5);
  await assert.rejects(store.save('', values()), /stable venue/);
});

test('photos are separate compressed blobs; two-photo limit and invalid compressed payloads are enforced', async () => {
  const { store, storage, blobs } = fixture();
  const { review } = await store.save('a', { ...values(), photos: [photo(), photo()] });
  assert.equal(blobs.size, 2);
  assert.equal(review.photoIds.length, 2);
  assert.equal(storage.getItem(reviewStorageKey('a')).includes('compressed-test-photo'), false);
  assert.equal((await store.loadPhotos(review.photoIds))[0].type, 'image/jpeg');
  await assert.rejects(store.save('a', { ...values(), photos: [photo(), photo(), photo()] }), /up to 2/);
  await assert.rejects(store.save('a', { ...values(), photos: [{ blob: new Blob(['video'], { type: 'video/mp4' }) }] }), /compressed photo/);
  await assert.rejects(store.save('a', { ...values(), photos: [{ blob: new Blob([new Uint8Array(MAX_REVIEW_PHOTO_BYTES + 1)], { type: 'image/jpeg' }) }] }), /compressed photo/);
  assert.equal(blobs.size, 2);
});

test('editing keeps identity and submission date, updates averages and removes replaced photos; deletion clears attachments', async () => {
  const { store, blobs } = fixture();
  const { review } = await store.save('a', { ...values(), photos: [photo(), photo()] });
  const kept = review.photoIds[0];
  const { review: edited } = await store.save('a', { ...values(null, 'Changed to comment only'), id: review.id, photos: [{ id: kept }] });
  assert.equal(edited.id, review.id);
  assert.equal(edited.createdAt, review.createdAt);
  assert.notEqual(edited.updatedAt, review.updatedAt);
  assert.equal(store.list('a').length, 1);
  assert.equal(blobs.size, 1);
  assert.equal(blobs.has(kept), true);
  assert.deepEqual(reviewSummary(store.list('a')), { average: null, count: 0 });
  await store.remove('a', review.id);
  assert.equal(store.list('a').length, 0);
  assert.equal(blobs.size, 0);
});

test('metadata quota failures roll back new photo blobs and preserve the existing review and photos', async () => {
  const { store, storage, blobs } = fixture();
  const { review } = await store.save('a', { ...values(), photos: [photo()] });
  const original = storage.getItem(reviewStorageKey('a'));
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  await assert.rejects(store.save('a', { ...values(4.5), id: review.id, photos: [photo()] }), /Not enough storage/);
  assert.equal(storage.getItem(reviewStorageKey('a')), original);
  assert.deepEqual([...blobs.keys()], review.photoIds);
  await assert.rejects(store.remove('a', review.id), /Not enough storage/);
  assert.equal(storage.getItem(reviewStorageKey('a')), original);
  assert.deepEqual([...blobs.keys()], review.photoIds);
});

test('photo-save failures create no phantom review, and cleanup failures are reported after successful metadata removal', async () => {
  const { store, photos } = fixture();
  const { review } = await store.save('a', { ...values(), photos: [photo()] });
  photos.put = async entries => { if (entries.length) throw new DOMException('Full', 'QuotaExceededError'); };
  await assert.rejects(store.save('a', { ...values(), photos: [photo()] }), /Not enough storage/);
  assert.equal(store.list('a').length, 1);
  await store.save('a', values(null, 'Text still saves without photo storage'));
  photos.remove = async () => { throw new Error('Device unavailable'); };
  const result = await store.remove('a', review.id);
  assert.match(result.warning, /couldn’t be removed/);
  assert.equal(store.list('a').length, 1);
});

test('unreadable or corrupt metadata is never replaced or silently shown as successful empty storage', async () => {
  const { store, storage } = fixture();
  const { review } = await store.save('a', values(null, 'A stored comment'));
  const missingRating = { ...review }; delete missingRating.rating;
  storage.setItem(reviewStorageKey('a'), JSON.stringify({ version: 1, reviews: [missingRating] }));
  assert.throws(() => store.list('a'), /Existing data has been kept/);
  storage.setItem(reviewStorageKey('a'), '{broken');
  assert.throws(() => store.list('a'), /Existing data has been kept/);
  await assert.rejects(store.save('a', values()), /Existing data has been kept/);
  assert.equal(storage.getItem(reviewStorageKey('a')), '{broken');
  storage.getItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  assert.throws(() => store.list('a'), /permissions/);
});

test('async photo writes retain another submitted review and cannot resurrect a removed review', async () => {
  const { store, photos, blobs } = fixture();
  const { review } = await store.save('a', values());
  let release;
  photos.put = async entries => { if (!entries.length) return; await new Promise(resolve => { release = resolve; }); entries.forEach(({ id, blob }) => blobs.set(id, blob)); };
  const pending = store.save('a', { ...values(4.5), photos: [photo()] });
  await store.save('a', values(0.5));
  release(); await pending;
  assert.equal(store.list('a').length, 3);
  const edit = store.save('a', { ...values(5), id: review.id, photos: [photo()] });
  await store.remove('a', review.id);
  release(); await assert.rejects(edit, /removed while/);
  assert.equal(store.list('a').length, 2);
  assert.equal(blobs.size, 1);
});

test('image validation accepts JPEG/PNG/WebP signatures, rejects renamed files, videos and oversized input', async () => {
  for (const [type, bytes] of [
    ['image/jpeg', Uint8Array.from([255, 216, 255, 0])],
    ['image/png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/webp', Buffer.from('RIFF1234WEBP')],
  ]) await validateReviewImage(new File([bytes], 'photo', { type }));
  await assert.rejects(validateReviewImage(new File(['<svg/>'], 'renamed.png', { type: 'image/png' })), /not a valid/);
  await assert.rejects(validateReviewImage(new File(['video'], 'video.mp4', { type: 'video/mp4' })), /Videos/);
  await assert.rejects(validateReviewImage(new File([new Uint8Array(11 * 1024 * 1024)], 'large.png', { type: 'image/png' })), /10 MB/);
});
