import { MAX_REVIEW_PHOTO_BYTES, REVIEW_PHOTO_LIMIT, reviewPhotoStore } from './reviewPhotos.js';

export const REVIEW_CHANGE_EVENT = 'melloway-venue-reviews-change';
export const reviewStorageKey = venueId => `melloway.venueReviews.v1.${encodeURIComponent(venueId)}`;
export const isReviewRating = value => typeof value === 'number' && Number.isFinite(value)
  && value >= 0.5 && value <= 5 && Number.isInteger(value * 2);

export function reviewSummary(reviews) {
  const ratings = reviews.map(review => review.rating).filter(isReviewRating);
  return { count: ratings.length, average: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null };
}

function storageProblem(error, photos = false) {
  return new Error(error?.name === 'QuotaExceededError'
    ? 'Not enough storage on this device. Remove a photo or an older review and try again.'
    : photos ? 'Photo storage is unavailable. Remove the photos to save your rating or comment, or try again.'
      : 'Couldn’t save reviews on this device. Check browser storage permissions and try again.');
}
function validVenue(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 512) throw new Error('A stable venue ID is required for reviews.');
}
function validValues(values) {
  const rating = values.rating ?? null, comment = values.comment ?? '', displayName = values.displayName;
  if (rating !== null && !isReviewRating(rating)) throw new Error('Choose a rating from 0.5 to 5 in half-star steps.');
  if (typeof comment !== 'string' || comment.length > 500) throw new Error('Keep your comment to 500 characters.');
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 60) throw new Error('Enter a display name of up to 60 characters.');
  if (rating === null && !comment.trim()) throw new Error('Add a rating or a comment before saving.');
  return { rating, comment: comment.trim(), displayName: displayName.trim() };
}
function validRecord(record, venueId) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id || record.venueId !== venueId
    || (record.rating !== null && !isReviewRating(record.rating))
    || !Array.isArray(record.photoIds) || record.photoIds.length > REVIEW_PHOTO_LIMIT
    || record.photoIds.some(id => typeof id !== 'string' || !id)
    || new Set(record.photoIds).size !== record.photoIds.length
    || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))
    || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return false;
  try { validValues(record); return true; } catch { return false; }
}

// Metadata never contains image bytes or touches the planner/cloud stores.
export function createVenueReviewStore({ storage = () => globalThis.localStorage, photos = reviewPhotoStore,
  id = () => crypto.randomUUID(), now = () => new Date().toISOString(), notify = venueId => {
    if (globalThis.window) window.dispatchEvent(new CustomEvent(REVIEW_CHANGE_EVENT, { detail: { venueId } }));
  } } = {}) {
  const getStorage = () => typeof storage === 'function' ? storage() : storage;
  function list(venueId) {
    validVenue(venueId);
    let raw;
    try { raw = getStorage().getItem(reviewStorageKey(venueId)); }
    catch { throw new Error('Reviews couldn’t be read on this device. Check browser storage permissions and try again.'); }
    if (raw === null) return [];
    let data;
    try { data = JSON.parse(raw); } catch { /* Preserve unreadable records rather than overwriting them. */ }
    if (!data || data.version !== 1 || !Array.isArray(data.reviews) || data.reviews.some(record => !validRecord(record, venueId))
      || new Set(data.reviews.map(record => record.id)).size !== data.reviews.length
      || new Set(data.reviews.flatMap(record => record.photoIds)).size !== data.reviews.flatMap(record => record.photoIds).length)
      throw new Error('Saved reviews couldn’t be read. Existing data has been kept; check device storage and try again.');
    return data.reviews;
  }
  function write(venueId, reviews) {
    try { getStorage().setItem(reviewStorageKey(venueId), JSON.stringify({ version: 1, reviews })); }
    catch (error) { throw storageProblem(error); }
  }
  async function cleanPhotos(ids) {
    if (!ids.length) return '';
    try { await photos.remove(ids); return ''; }
    catch { return 'The review was updated, but some old photos couldn’t be removed from device storage. Try again later.'; }
  }
  return {
    list,
    async loadPhotos(ids) {
      try { return await photos.get(ids); } catch (error) { throw storageProblem(error, true); }
    },
    async save(venueId, values) {
      const existing = list(venueId), previous = values.id ? existing.find(review => review.id === values.id) : null;
      if (values.id && !previous) throw new Error('This review is no longer saved. Close the form and try again.');
      const fields = validValues(values), selected = values.photos || [];
      if (!Array.isArray(selected) || selected.length > REVIEW_PHOTO_LIMIT) throw new Error('Attach up to 2 photos.');
      const additions = [], photoIds = selected.map(photo => {
        if (previous?.photoIds.includes(photo.id)) return photo.id;
        if (!(photo.blob instanceof Blob) || photo.blob.type !== 'image/jpeg' || !photo.blob.size || photo.blob.size > MAX_REVIEW_PHOTO_BYTES)
          throw new Error('Choose a valid compressed photo before saving.');
        const photoId = id(); additions.push({ id: photoId, blob: photo.blob }); return photoId;
      });
      if (new Set(photoIds).size !== photoIds.length) throw new Error('Each photo can only be attached once.');
      const timestamp = now(), review = { ...fields, id: previous?.id || id(), venueId, photoIds,
        createdAt: previous?.createdAt || timestamp, updatedAt: timestamp };
      try { await photos.put(additions); } catch (error) { throw storageProblem(error, true); }
      try {
        // Re-read after the asynchronous photo write so another form's review is retained.
        const latest = list(venueId);
        if (previous && !latest.some(record => record.id === previous.id)) throw new Error('This review was removed while the form was open.');
        if (previous && JSON.stringify(latest.find(record => record.id === previous.id)) !== JSON.stringify(previous))
          throw new Error('This review changed in another tab. Close the form and edit the latest version.');
        write(venueId, [review, ...latest.filter(record => record.id !== review.id)]);
      } catch (error) {
        await cleanPhotos(additions.map(photo => photo.id));
        throw error;
      }
      notify(venueId);
      const warning = await cleanPhotos((previous?.photoIds || []).filter(photoId => !photoIds.includes(photoId)));
      return { review, warning };
    },
    async remove(venueId, reviewId) {
      const existing = list(venueId), review = existing.find(record => record.id === reviewId);
      if (!review) return { warning: '' };
      write(venueId, existing.filter(record => record.id !== reviewId));
      notify(venueId);
      return { warning: await cleanPhotos(review.photoIds) };
    },
  };
}

export const venueReviewStore = createVenueReviewStore();
