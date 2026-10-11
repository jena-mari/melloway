import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bookmark, RotateCcw, Star, X } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Button } from './UI';
import { Doodle } from './DoodleBackdrop';
import { sydneyToday } from '../utils/date';
import { createId } from '../utils/id';
import { recreateRoute } from '../utils/routeHistory';
import { prepareRouteEdit } from '../services/discovery';

export function StarRating({ value, onChange }) {
  return <fieldset className="date-stars">
    <legend>overall rating</legend>
    <div>{[1, 2, 3, 4, 5].map(n => <label key={n}>
      <input type="radio" name="date-rating" value={n} checked={value === n}
        onChange={() => onChange(n)} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`} />
      <Star size={29} fill={n <= value ? 'currentColor' : 'none'} aria-hidden="true" />
    </label>)}</div>
    {value && <button type="button" className="text-button" onClick={() => onChange(null)}>clear rating</button>}
  </fieldset>;
}

function Sheet({ entry }) {
  const { completionMode, dismissCompletion, saveReview, saved, save, setCurrent,
    current, setDraft, setStatus } = useApp();
  const navigate = useNavigate();
  const dialog = useRef(null);
  const request = useRef(null);
  const [mode, setMode] = useState(completionMode);
  const [rating, setRating] = useState(entry.review.rating);
  const [text, setText] = useState(entry.review.text);
  const [stopRatings, setStopRatings] = useState(entry.review.stopRatings);
  const [date, setDate] = useState(sydneyToday);
  const [time, setTime] = useState(entry.plan.prefs.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replaceActive, setReplaceActive] = useState(false);
  const isSaved = saved.some(p => p.id === entry.id);
  const outing = entry.plan.prefs.mode === 'date' ? 'date' : 'hangout';
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; request.current?.abort(); };
  }, []);
  useEffect(() => {
    const sheet = dialog.current;
    sheet.scrollTop = 0;
    sheet.querySelector('h2')?.focus({ preventScroll: true });
  }, [mode]);
  function home() { dismissCompletion(); navigate('/'); }
  function review(event) {
    event.preventDefault();
    if (saveReview(entry.id, { rating, text, stopRatings })) dismissCompletion();
    else setError('Your review wasn’t saved. Please try again.');
  }
  function share() {
    if (!saveReview(entry.id, { rating, text, stopRatings })) {
      setError('Save your review before sharing. Please try again.'); return;
    }
    dismissCompletion();
    navigate(`/community?compose=1&history=${encodeURIComponent(entry.id)}`);
  }
  async function redo(customise) {
    if (busy || (current && !replaceActive)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError('');
    try {
      const prefs = { ...entry.plan.prefs, date, time, timeExplicit: true };
      const options = await prepareRouteEdit({ ...entry.plan, prefs }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const route = recreateRoute(entry, prefs, options, createId());
      if (!route) { setError('These stops don’t fit that day or time. Try another, or make a new version.'); return; }
      if (setCurrent(route)) {
        dismissCompletion();
        setStatus('A fresh copy. Your past date is still in history.');
        navigate('/itinerary', { state: { editStops: customise } });
      } else setError('Couldn’t store the new copy. Please try again.');
    } catch (e) {
      if (!controller.signal.aborted) setError('Couldn’t check this route. Please try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function newVersion() {
    setDraft({ ...entry.plan.prefs, date, time,
      preferences: entry.plan.prefs.selectedPreferences || entry.plan.prefs.preferences });
    dismissCompletion(); navigate('/plan/details');
  }
  return <dialog ref={dialog} className="stop-picker-dialog completion-sheet"
    aria-labelledby="completion-title" onClose={dismissCompletion}
    onClick={e => { if (e.target === e.currentTarget) dialog.current.close(); }}>
    <div className="completion-content">
      <span className="sheet-handle" aria-hidden="true" />
      <header>
        {mode !== 'choice' && <button className="icon-button" type="button" aria-label="back to completion options"
          onClick={() => { setMode('choice'); setError(''); }}><ArrowLeft size={19} /></button>}
        <button className="icon-button completion-close" type="button" aria-label="dismiss date completion"
          onClick={() => dialog.current.close()}><X size={21} /></button>
      </header>
      {mode === 'choice' ? <>
        <div className="completion-doodle" aria-hidden="true"><Doodle kind="flower" /></div>
        <h2 id="completion-title" tabIndex={-1}>{outing} complete!<br />how’d it go? 💌</h2>
        <p className="completion-caption">tucked away in Past Dates.</p>
        <div className="completion-options">
          <Button onClick={() => setMode('rate')}><Star size={18} /> rate this {outing}</Button>
          <Button className="completion-outline" onClick={() => setMode('redo')}><RotateCcw size={18} /> redo this route</Button>
          <button type="button" className="text-button" onClick={home}>back to home <ArrowRight size={17} /></button>
        </div>
      </> : mode === 'rate' ? <form onSubmit={review}>
        <h2 id="completion-title" tabIndex={-1}>how was ur {outing}?</h2>
        <p className="completion-caption">private, unless you choose to share.</p>
        <StarRating value={rating} onChange={setRating} />
        <label className="field" htmlFor="date-review"><span>a little review · optional</span>
          <textarea id="date-review" value={text} onChange={e => setText(e.target.value)}
            maxLength={300} rows={3} placeholder="the good bits, the funny bits…" />
        </label>
        <details className="date-stop-ratings"><summary>rate the spots · optional</summary>
          {entry.plan.stops.map(stop => <label key={stop.id}>
            <span>{stop.name}</span>
            <select aria-label={`Your rating for ${stop.name}`} value={stopRatings[stop.id] || ''}
              onChange={e => setStopRatings(old => ({ ...old, [stop.id]: Number(e.target.value) }))}>
              <option value="">unrated</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
            </select>
          </label>)}
        </details>
        <div className="completion-options">
          <Button type="submit">save privately</Button>
          <button type="button" className="text-button" onClick={share}>share with community <ArrowRight size={17} /></button>
        </div>
      </form> : <form onSubmit={e => { e.preventDefault(); redo(false); }}>
        <h2 id="completion-title" tabIndex={-1}>one more good day.</h2>
        <p className="completion-caption">same route, a new copy.</p>
        <div className="two-fields">
          <label className="field"><span>day</span><input type="date" min={sydneyToday()} required
            value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="field"><span>start time</span><input type="time" required
            value={time} onChange={e => setTime(e.target.value)} /></label>
        </div>
        {current && <label className="date-replace-warning"><input type="checkbox" checked={replaceActive}
          onChange={e => setReplaceActive(e.target.checked)} /> replace my current {current.plan.status === 'in-progress' ? 'in-progress' : 'upcoming'} plan</label>}
        <div className="completion-options" aria-busy={busy}>
          <Button type="submit" disabled={busy || Boolean(current && !replaceActive)}>
            <RotateCcw size={17} />{busy ? 'checking the route…' : 'redo route'}
          </Button>
          <Button type="button" className="completion-outline" disabled={busy || Boolean(current && !replaceActive)}
            onClick={() => redo(true)}>customise stops</Button>
          <button type="button" className="text-button" disabled={busy} onClick={newVersion}>make a new version <ArrowRight size={17} /></button>
        </div>
      </form>}
      {error && <p className="date-error" role="alert">{error}</p>}
      <button className="completion-save text-button" type="button" onClick={() => save(entry.plan)}>
        <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />{isSaved ? 'saved to favourites' : 'save to favourites'}
      </button>
    </div>
  </dialog>;
}

export default function CompletionSheet() {
  const { completionId, history } = useApp();
  const entry = history.find(r => r.id === completionId);
  return entry ? <Sheet key={entry.id} entry={entry} /> : null;
}
