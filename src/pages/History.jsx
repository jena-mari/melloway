import { useState, lazy, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bookmark, RotateCcw, Star } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import RouteSummary from '../components/RouteSummary';
import StopDetails from '../components/StopDetails';
import Venue from './Venue';
const RouteMap = lazy(() => import('../components/RouteMap'));

function completedDay(value) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney',
    day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
export default function History() {
  const { history, saved, save, openCompletion } = useApp();
  const { historyId, id } = useParams();
  const [detailId, setDetailId] = useState('');
  const entry = history.find(r => r.id === historyId);
  if (historyId && !entry) return <div className="page history-page">
    <h1>that date isn’t here.</h1><Link to="/history">past dates</Link>
  </div>;
  if (entry && id) return <Venue route={{ plan: entry.plan }} backTo={`/history/${entry.id}`} />;
  if (entry) {
    const { plan, review } = entry;
    const index = plan.stops.findIndex(s => s.id === detailId);
    const bookmarked = saved.some(p => p.id === entry.id);
    return <div className="page history-page">
      <Link className="back" to="/history"><ArrowLeft size={17} /> past dates</Link>
      <header className="history-heading">
        <p className="eyebrow">completed · {completedDay(entry.completedAt)}</p>
        <h1>{plan.title || plan.prefs.area}</h1>
      </header>
      <RouteSummary key={entry.id} plan={plan} location={plan.prefs.area} readOnly onSelect={setDetailId} />
      <Suspense fallback={<p role="status">bringing up the map…</p>}>
        <RouteMap compact stops={plan.stops} transport={plan.prefs.transport}
          selectedStopId={detailId} onSelectStop={setDetailId} />
      </Suspense>
      <section className="history-review" aria-label="Your private review">
        <div><h2>ur review</h2><span>private</span></div>
        {review.rating && <p aria-label={`${review.rating} out of 5 stars`}><Star size={16} fill="currentColor" /> {review.rating} / 5</p>}
        {review.text && <p>{review.text}</p>}
        {Object.keys(review.stopRatings).length > 0 && <details><summary>spot ratings</summary>
          {plan.stops.filter(s => review.stopRatings[s.id]).map(s => <p key={s.id}>{s.name} · {review.stopRatings[s.id]} / 5</p>)}
        </details>}
        <button type="button" className="text-button" onClick={() => openCompletion(entry.id, 'rate')}>
          {review.rating || review.text || Object.keys(review.stopRatings).length ? 'edit review' : 'rate this date'} <ArrowRight size={15} />
        </button>
      </section>
      <div className="history-actions">
        <button className="button" onClick={() => openCompletion(entry.id, 'redo')}><RotateCcw size={17} /> redo route</button>
        <button className="button completion-outline" disabled={bookmarked} onClick={() => save(plan)}>
          <Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} />{bookmarked ? 'saved' : 'save route'}
        </button>
      </div>
      {index >= 0 && <StopDetails key={detailId} stop={plan.stops[index]} index={index} prefs={plan.prefs}
        onClose={() => setDetailId('')} venueLink={`/history/${entry.id}/venue/${plan.stops[index].id}`} />}
    </div>;
  }
  return <div className="page history-page">
    <h1>past dates.</h1>
    {!history.length ? <div className="empty-state"><h2>good days go here.</h2>
      <Link className="button" to="/">make a plan <ArrowRight size={17} /></Link>
    </div> : <div className="history-list">{history.map(r => <article key={r.id}>
      <Link className="history-route-link" to={`/history/${r.id}`}>
        <span className="eyebrow">completed · {completedDay(r.completedAt)}</span>
        <h2>{r.plan.title || r.plan.prefs.area}</h2>
        <p>{r.plan.stops.length} stops{r.review.rating ? ` · ${r.review.rating} / 5` : ''}</p>
        <ArrowRight size={19} aria-hidden="true" />
      </Link>
      <div className="history-quick-actions">
        <button aria-label={`Rate ${r.plan.title || r.plan.prefs.area}`} onClick={() => openCompletion(r.id, 'rate')}><Star size={19} /></button>
        <button aria-label={`Save ${r.plan.title || r.plan.prefs.area}`} disabled={saved.some(p => p.id === r.id)}
          onClick={() => save(r.plan)}><Bookmark size={19} fill={saved.some(p => p.id === r.id) ? 'currentColor' : 'none'} /></button>
        <button aria-label={`Redo ${r.plan.title || r.plan.prefs.area}`} onClick={() => openCompletion(r.id, 'redo')}><RotateCcw size={19} /></button>
      </div>
    </article>)}</div>}
  </div>;
}
