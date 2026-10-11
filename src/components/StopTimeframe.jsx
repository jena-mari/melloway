import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatTime } from '../utils/planner.js';

export default function StopTimeframe({ stop, index, busy, onApply, onClose }) {
  const dialog = useRef(null);
  const [arrival, setArrival] = useState(() => `${String(Math.floor(stop.arrival % 1440 / 60)).padStart(2, '0')}:${String(Math.round(stop.arrival % 60)).padStart(2, '0')}`);
  const [duration, setDuration] = useState(String(stop.mins));
  const [automatic, setAutomatic] = useState(false);
  const [nextDay, setNextDay] = useState(stop.arrival >= 1440);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  async function submit(event) {
    event.preventDefault();
    const mins = Number(duration);
    if (!Number.isInteger(mins) || mins < 5 || mins > 480) { setError('Choose 5–480 minutes.'); return; }
    const [hour, minute] = arrival.split(':').map(Number);
    const values = { mins, arrivalOverride: automatic ? undefined : hour * 60 + minute + (nextDay ? 1440 : 0) };
    const problem = await onApply(values);
    if (problem) setError(problem); else onClose();
  }
  return <dialog ref={dialog} className="stop-picker-dialog timeframe-dialog" aria-labelledby="timeframe-title"
    onClose={onClose} onClick={event => { if (event.target === dialog.current && !busy) dialog.current.close(); }}>
    <form className="stop-picker-content" onSubmit={submit}>
      <header><div><p>stop {String.fromCharCode(65 + index)}</p><h2 id="timeframe-title">{stop.name}</h2></div>
        <button type="button" aria-label="close timeframe" disabled={busy} onClick={() => dialog.current.close()}><X size={22} /></button></header>
      <label className="timeframe-auto"><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} /> fit arrival automatically</label>
      {!automatic && <div className="timeframe-fields"><label>arrive at<input type="time" autoFocus required value={arrival} onChange={e => setArrival(e.target.value)} /></label>
        <label>day<select value={nextDay ? 'next' : 'same'} onChange={e => setNextDay(e.target.value === 'next')}><option value="same">same day</option><option value="next">next day</option></select></label></div>}
      <label className="timeframe-duration">visit length <span><input aria-label="visit length in minutes" type="number" inputMode="numeric" min={5} max={480} required value={duration} onChange={e => setDuration(e.target.value)} /> min</span></label>
      <p className="muted">{formatTime(stop.arrival)} now · later stops update with this edit.</p>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? 'checking…' : 'save timeframe'}</button>
    </form>
  </dialog>;
}
