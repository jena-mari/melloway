import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw, Trash2, Navigation } from 'lucide-react';
import { MoodImage } from './UI';
import { stopOpeningHours, stopDirections } from '../utils/stopDetails';
import RecommendationEvidence from './RecommendationEvidence';
import VenueSocial from './VenueSocial';

export default function InlineStopDetails({ stop: s, index, prefs, busy, onReplace, onRemove, canRemove, venueLink, venueState }) {
  const [showSocial, setShowSocial] = useState(false);
  const matches = s.tags.filter(tag => (prefs.selectedPreferences || prefs.preferences).includes(tag));
  return <div className="inline-stop-details">
    <figure className="inline-stop-photo">
      {s.image ? <><MoodImage src={s.image} alt={s.source === 'demo' ? 'Illustrative mood photograph' : s.name} />
        <figcaption>{s.source === 'demo' ? 'mood imagery' : s.source === 'curated' ? 'sourced venue photo' : `Google Places${s.attribution ? ' · ' + s.attribution : ''}`}</figcaption></> : <figcaption>venue photo unavailable</figcaption>}
    </figure>
    <p className="inline-stop-description">{s.description || s.note || `${s.category} · ${s.address}`}</p>
    <dl className="inline-stop-facts">
      <div><dt>opening hours</dt><dd>{stopOpeningHours(s, prefs)}</dd></div>
      <div><dt>estimated cost</dt><dd>~${s.cost} each</dd></div>
      <div><dt>visit</dt><dd>{s.mins} min</dd></div>
    </dl>
    {Number.isFinite(s.estimatedCost) && s.cost !== s.estimatedCost && <p className="inline-stop-note">{s.budgetCategory === 'shopping' ? `$${Math.round((s.cost - s.estimatedCost) * 100) / 100} for purchases · ~$${s.estimatedCost} entry` : `$${s.cost} budget · ~$${s.estimatedCost} estimate`}</p>}
    <p className="inline-stop-reason"><strong>why this spot</strong>{s.reason || (matches.length ? `Matches your ${matches.join(' + ')} picks.` : 'Fits this route’s time and budget.')}</p>
    {s.booking && <p className="inline-stop-note">{s.booking}</p>}
    {s.description && s.note && <p className="inline-stop-note">{s.note}</p>}
    {index > 0 && s.travelFromPrevious && <p className="inline-stop-note">{s.travelFromPrevious.minutes} min from previous stop · {prefs.transport === 'Not selected' ? 'planning buffer · no travel mode selected' : prefs.transport.toLowerCase()} · {s.travelFromPrevious.source === 'google' ? 'Google route estimate' : `rough estimate, ${s.travelFromPrevious.distance.toFixed(1)} km straight-line`}</p>}
    {s.rating && <p className="inline-stop-note">{s.rating}/5 · Google rating</p>}
    <div className="inline-stop-actions">
      <Link to={venueLink || `/venue/${s.id}`} state={venueState}>View Details <ArrowUpRight size={15} /></Link>
      <button type="button" disabled={busy} onClick={onReplace}><RefreshCw size={15} /> Replace Stop</button>
      <button type="button" disabled={busy || !canRemove} title={!canRemove ? 'Keep one stop in your route' : undefined} onClick={onRemove}><Trash2 size={15} /> Remove Stop</button>
      <a href={stopDirections(s, prefs.transport)} target="_blank" rel="noreferrer"><Navigation size={15} /> Directions</a>
    </div>
    {s.website && <a className="inline-stop-source" href={s.website} target="_blank" rel="noreferrer">venue source ↗</a>}
    <RecommendationEvidence venue={s} />
    <details className="inline-stop-social" onToggle={event => setShowSocial(event.currentTarget.open)}>
      <summary>see the place</summary>
      {showSocial && <VenueSocial venue={s} compact />}
    </details>
  </div>;
}
