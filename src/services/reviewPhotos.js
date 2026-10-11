export const REVIEW_PHOTO_LIMIT = 2;
export const MAX_REVIEW_PHOTO_BYTES = 500 * 1024;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const types = ['image/jpeg', 'image/png', 'image/webp'];

export async function validateReviewImage(file) {
  if (!types.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo. Videos are not supported.');
  if (!file.size || file.size > MAX_INPUT_BYTES) throw new Error('Choose a photo smaller than 10 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const detected = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : text(0, 8) === '\x89PNG\r\n\x1a\n' ? 'image/png'
      : text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP' ? 'image/webp' : null;
  if (detected !== file.type) throw new Error('This file is not a valid JPEG, PNG or WebP photo.');
}

export async function compressReviewImage(file) {
  await validateReviewImage(file);
  let image, sourceUrl;
  try {
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(file);
    else {
      sourceUrl = URL.createObjectURL(file);
      image = new Image();
      image.src = sourceUrl;
      await image.decode();
    }
    if (!image.width || !image.height || image.width * image.height > 100000000)
      throw new Error('Choose a smaller photo.');
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo compression is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.48, 0.3]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_REVIEW_PHOTO_BYTES) return blob;
    }
    throw new Error('This photo is still too large after compression. Choose a smaller photo.');
  } catch (error) {
    if (error.message?.startsWith('Choose') || error.message?.startsWith('Photo') || error.message?.startsWith('This photo')) throw error;
    throw new Error('This photo could not be read. Choose another JPEG, PNG or WebP image.');
  } finally {
    image?.close?.();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
}

export function createReviewPhotoStore(provider = () => globalThis.indexedDB) {
  let opening;
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const factory = provider();
      if (!factory) { reject(new Error('IndexedDB unavailable')); return; }
      const request = factory.open('melloway-review-photos', 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('Photo storage is busy. Close other Melloway tabs and retry.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }
  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('photos', mode), store = transaction.objectStore('photos');
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Photo storage failed'));
      try { result = action(store); } catch (error) { transaction.abort(); reject(error); }
    });
  }
  return {
    async put(entries) { if (entries.length) await transact('readwrite', store => entries.forEach(entry => store.put(entry))); },
    async get(ids) {
      if (!ids.length) return [];
      const records = await transact('readonly', store => ids.map(id => store.get(id)));
      return records.map(request => request.result?.blob || null);
    },
    async remove(ids) { if (ids.length) await transact('readwrite', store => ids.forEach(id => store.delete(id))); },
  };
}

export const reviewPhotoStore = createReviewPhotoStore();
