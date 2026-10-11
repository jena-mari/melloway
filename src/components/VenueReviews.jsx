import { useEffect, useId, useRef, useState } from 'react';
import { Star, X } from 'lucide-react';
import { useApp } from '../hooks/useApp.jsx';
import { compressReviewImage } from '../services/reviewPhotos.js';
import { REVIEW_CHANGE_EVENT, reviewStorageKey, reviewSummary, venueReviewStore } from '../services/venueReviews.js';

export function ReviewStars({ value }) {
  return <span className="venue-review-stars" role="img" aria-label={`${Number(value.toFixed(1))} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, index) => <span className="venue-review-star" key={index} aria-hidden="true">
      <Star size={22} />
      <span style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}><Star size={22} fill="currentColor" /></span>
    </span>)}
  </span>;
}

function SavedPhotos({ review }) {
  const [urls, setUrls] = useState([]), [error, setError] = useState('');
  const ids = JSON.stringify(review.photoIds);
  useEffect(() => {
    let alive = true, previews = [];
    setUrls([]); setError('');
    venueReviewStore.loadPhotos(review.photoIds).then(blobs => {
      if (!alive) return;
      previews = blobs.map(blob => blob ? URL.createObjectURL(blob) : null);
      setUrls(previews);
      if (previews.some(url => !url)) setError('Some photos are unavailable on this device.');
    }).catch(() => { if (alive) setError('Photos couldn’t be loaded on this device.'); });
    return () => { alive = false; previews.forEach(url => { if (url) URL.revokeObjectURL(url); }); };
  }, [ids]);
  return <>{urls.some(Boolean) && <div className="venue-review-photos">
    {urls.map((url, index) => url && <img key={review.photoIds[index]} src={url} alt={`${review.displayName}’s review photo ${index + 1}`} />)}
  </div>}{error && <p className="venue-review-note">{error}</p>}</>;
}

function ReviewForm({ venue, review, displayName, onClose, onSaved }) {
  const dialog = useRef(null), alive = useRef(true), urls = useRef(new Set()), titleId = useId(), ratingName = useId();
  const [name, setName] = useState(review?.displayName || displayName || 'You');
  const [rating, setRating] = useState(review?.rating ?? null), [comment, setComment] = useState(review?.comment || '');
  const [photos, setPhotos] = useState(() => (review?.photoIds || []).map(id => ({ id, url: null })));
  const [loadingPhotos, setLoadingPhotos] = useState(Boolean(review?.photoIds.length));
  const [processing, setProcessing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    alive.current = true;
    const opener = document.activeElement, overflow = document.body.style.overflow, locksPage = overflow !== 'hidden';
    dialog.current.showModal();
    if (locksPage) document.body.style.overflow = 'hidden';
    if (review?.photoIds.length) venueReviewStore.loadPhotos(review.photoIds).then(blobs => {
      if (!alive.current) return;
      setPhotos(blobs.map((blob, index) => {
        const url = blob ? URL.createObjectURL(blob) : null;
        if (url) urls.current.add(url);
        return { id: review.photoIds[index], blob, url };
      }));
    }).catch(() => { if (alive.current) setError('Saved photos couldn’t be loaded. You can keep them or remove them below.'); })
      .finally(() => { if (alive.current) setLoadingPhotos(false); });
    return () => {
      alive.current = false; urls.current.forEach(url => URL.revokeObjectURL(url));
      if (locksPage) document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  async function addPhotos(event) {
    const files = [...event.target.files]; event.target.value = '';
    if (!files.length) return;
    if (files.length + photos.length > 2) { setError('Attach up to 2 photos. Remove one before adding another.'); return; }
    setProcessing(true); setError('');
    const additions = [];
    try {
      for (const file of files) {
        const blob = await compressReviewImage(file);
        if (!alive.current) return;
        const url = URL.createObjectURL(blob); urls.current.add(url);
        additions.push({ id: crypto.randomUUID(), blob, url });
      }
      setPhotos(previous => [...previous, ...additions]);
    } catch (failure) {
      additions.forEach(photo => { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); });
      if (alive.current) setError(failure.message);
    } finally { if (alive.current) setProcessing(false); }
  }
  function removePhoto(photo) {
    if (photo.url) { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); }
    setPhotos(previous => previous.filter(item => item.id !== photo.id));
  }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const result = await venueReviewStore.save(venue.id, { id: review?.id, displayName: name, rating, comment, photos });
      if (alive.current) { dialog.current.close(); onSaved(result.warning); }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setSaving(false); }
  }
  const busy = saving || processing || loadingPhotos;
  return <dialog ref={dialog} className="stop-picker-dialog venue-review-dialog" aria-labelledby={titleId}
    onClose={event => { if (event.target === dialog.current) onClose(); }}
    onCancel={event => { if (saving) event.preventDefault(); }}
    onClick={event => { if (event.target === dialog.current && !saving) dialog.current.close(); }}>
    <form className="stop-picker-content venue-review-form" onSubmit={submit}>
      <header><div><p>{venue.name}</p><h2 id={titleId}>{review ? 'edit your review' : 'leave a review'}</h2></div>
        <button type="button" disabled={saving} aria-label="close review form" onClick={() => dialog.current.close()}><X size={22} /></button></header>
      <label>display name<input autoFocus value={name} required maxLength={60} disabled={saving} onChange={event => setName(event.target.value)} /></label>
      <fieldset className="venue-review-rating"><legend>rating (optional)</legend>
        <div>{Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map(value => <label key={value} className={rating === value ? 'is-selected' : ''}>
          <input type="radio" name={ratingName} value={value} checked={rating === value} disabled={saving}
            aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} onChange={() => setRating(value)} />{value}<Star size={14} aria-hidden="true" />
        </label>)}</div>
        {rating !== null && <div className="venue-review-rating-preview"><ReviewStars value={rating} /><button className="text-button" type="button" disabled={saving} onClick={() => setRating(null)}>clear rating</button></div>}
      </fieldset>
      <label>comment (optional)<textarea aria-label="comment (optional)" rows={4} maxLength={500} value={comment} disabled={saving} onChange={event => setComment(event.target.value)} /></label>
      <small className="venue-review-counter">{comment.length} / 500</small>
      <label className="venue-review-file">photos (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={addPhotos} />
        <small>Up to 2 photos · JPEG, PNG or WebP · up to 10 MB each</small></label>
      {photos.length > 0 && <div className="venue-review-photo-previews">{photos.map((photo, index) => <figure key={photo.id}>
        {photo.url ? <img src={photo.url} alt={`Review photo preview ${index + 1}`} /> : <p>Photo unavailable</p>}
        <button className="text-button" type="button" disabled={busy} onClick={() => removePhoto(photo)}>remove photo {index + 1}</button>
      </figure>)}</div>}
      {(processing || loadingPhotos) && <p role="status">{processing ? 'preparing photos…' : 'loading saved photos…'}</p>}
      <p className="venue-review-note">Reviews are saved on this device for now.</p>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={busy}>{saving ? 'saving…' : 'save review'}</button>
    </form>
  </dialog>;
}

export default function VenueReviews({ venue }) {
  const titleId = useId(), { profile } = useApp() || {};
  const [reviews, setReviews] = useState([]), [loadError, setLoadError] = useState(''), [message, setMessage] = useState('');
  const [form, setForm] = useState(null), [deleting, setDeleting] = useState('');
  function load() {
    try { setReviews(venueReviewStore.list(venue.id)); setLoadError(''); }
    catch (error) { setReviews([]); setLoadError(error.message); }
  }
  useEffect(() => {
    load(); setForm(null); setMessage('');
    const changed = event => {
      if (event.type === 'storage' ? event.key === null || event.key === reviewStorageKey(venue.id) : event.detail?.venueId === venue.id) load();
    };
    window.addEventListener('storage', changed); window.addEventListener(REVIEW_CHANGE_EVENT, changed);
    return () => { window.removeEventListener('storage', changed); window.removeEventListener(REVIEW_CHANGE_EVENT, changed); };
  }, [venue.id]);
  async function remove(review) {
    setDeleting(review.id); setMessage('');
    try { const result = await venueReviewStore.remove(venue.id, review.id); load(); setMessage(result.warning || 'Review deleted from this device.'); }
    catch (error) { setMessage(error.message); }
    finally { setDeleting(''); }
  }
  const summary = reviewSummary(reviews);
  return <section className="venue-reviews" aria-labelledby={titleId} data-venue-id={venue.id}>
    <header><h2 id={titleId}>what people think</h2><button type="button" className="text-button" disabled={Boolean(loadError)} onClick={() => { setMessage(''); setForm({}); }}>leave a review</button></header>
    <p className="venue-review-note">Reviews are saved on this device for now.</p>
    {loadError ? <div role="alert"><p>{loadError}</p><button type="button" className="text-button" onClick={load}>try reading reviews again</button></div> : <>
      <div className="venue-review-summary" aria-label="Local community rating">
        {summary.average !== null ? <><ReviewStars value={summary.average} /><strong>{Number(summary.average.toFixed(1))}/5</strong></> : <span>No ratings yet</span>}
        <span>{summary.count} {summary.count === 1 ? 'rating' : 'ratings'}</span>
      </div>
      {!reviews.length && <p className="venue-review-empty">No reviews here yet. Leave a little thought about this spot.</p>}
      <div className="venue-review-list">{reviews.map(review => <article className="venue-review-card" aria-label={`${review.displayName}’s review`} key={review.id}>
        <div className="venue-review-byline"><strong>{review.displayName}</strong><time dateTime={review.createdAt}>{new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }).format(new Date(review.createdAt))}</time></div>
        {review.rating !== null ? <div className="venue-review-card-rating"><ReviewStars value={review.rating} /><span>{review.rating}/5</span></div> : <small>Comment only</small>}
        {review.comment && <p className="venue-review-comment">{review.comment}</p>}
        {review.photoIds.length > 0 && <SavedPhotos review={review} />}
        <div className="venue-review-actions"><button className="text-button" type="button" disabled={Boolean(deleting)} aria-label={`edit review by ${review.displayName}`} onClick={() => setForm(review)}>edit</button>
          <button className="text-button" type="button" disabled={Boolean(deleting)} aria-label={`delete review by ${review.displayName}`} onClick={() => remove(review)}>{deleting === review.id ? 'deleting…' : 'delete'}</button></div>
      </article>)}</div>
    </>}
    {message && <p role="status" className="venue-review-note">{message}</p>}
    {form && <ReviewForm venue={venue} review={form.id ? form : null} displayName={profile?.name} onClose={() => setForm(null)} onSaved={warning => { setForm(null); load(); setMessage(warning || 'Review saved on this device.'); }} />}
  </section>;
}
