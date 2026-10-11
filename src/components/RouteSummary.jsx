import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUp,
  ArrowDown,
  CircleArrowRight,
  Pencil,
  Plus,
  X,
  Shuffle,
  Route,
} from "lucide-react";
import { formatTime, minutes } from '../utils/planner.js';
import { formatRouteDate, formatRouteDuration, betweenStopsLabel } from '../utils/routeTiming.js';

export default function RouteSummary({
  plan,
  location,
  busy,
  onMove,
  onRemove,
  onChange,
  onAdd,
  onSelect,
  visibleStops,
  onReset,
  onEdit,
  onRename,
  readOnly = false,
  initialEditing = false,
  onSchedule,
  onSwap,
  onOrder,
  onTransport,
  selectedStopId,
  expandedStopId,
  renderDetails,
}) {
  const [editing, setEditing] = useState(initialEditing && !readOnly);
  const reduced = useReducedMotion();
  const rows = editing || !visibleStops ? plan.stops.map((stop, index) => ({ stop, index })) : visibleStops;
  return (
    <section
      className="route-summary"
      aria-label="Route summary"
      aria-busy={busy}
    >
      <div className="route-summary-heading">
        <div>
          <h2>{onRename && !readOnly ? <button type="button" className="route-rename" disabled={busy}
            title={`Rename ${plan.prefs.mode === 'date' ? 'date' : 'hangout'}`}
            aria-haspopup="dialog" onClick={onRename}>
            {plan.title || location}
          </button> : plan.title || location}</h2>
          <div className="route-day-schedule" aria-label="Your day timing">
            <p><time dateTime={plan.prefs.date}>{formatRouteDate(plan.prefs.date)}</time> · {formatTime(minutes(plan.prefs.time))} start</p>
            <p><strong>~{formatRouteDuration(plan.elapsed)} / {formatRouteDuration(Number(plan.prefs.duration) * 60)} available</strong>
              {' · '}<span>{plan.prefs.transport === 'Not selected' ? 'Travel mode not selected · planning buffer' : plan.prefs.transport} · {plan.travel} min · estimated</span>
            </p>
            <p><strong>~${plan.cost} / ${plan.prefs.budget} each</strong></p>
          </div>
        </div>
        {!readOnly && <button
          className="route-edit-toggle"
          aria-label={editing ? "done" : "edit"}
          aria-pressed={editing}
          onClick={() => {
            if (!editing) onEdit?.();
            setEditing(!editing);
          }}
        >
          {editing ? (
            "done"
          ) : (
            <>
              <Pencil size={17} aria-hidden="true" />
            </>
          )}
        </button>}
      </div>
      {!readOnly && onOrder && <div className="route-order-controls">
        <label><span className="sr-only">transportation</span><select aria-label="transportation" value={plan.prefs.transport} disabled={busy} onChange={e => onTransport(e.target.value)}>
          <option value="Not selected">choose transport</option><option>Walking</option><option>Public transport</option><option>Driving</option>
        </select></label>
        <button type="button" disabled={busy} onClick={() => onOrder('optimise')} aria-label="optimise route"><Route size={16} /><span>optimise</span></button>
        <button type="button" disabled={busy || plan.stops.length < 2} onClick={() => onOrder('shuffle')} aria-label="shuffle route"><Shuffle size={16} /><span>shuffle</span></button>
      </div>}
      <ol className={`route-summary-list ${editing ? "editing" : ""}`}>
        {rows.map(({ stop, index: i }, rowIndex) => (
          <li key={stop.id} className={selectedStopId === stop.id ? 'selected-route-stop' : undefined} data-stop-id={stop.id}>
            <div className="route-stop-box">
            <span className="route-letter" aria-hidden="true">
              {String.fromCharCode(65 + i)}
            </span>
            <button
              className="route-summary-spot"
              onClick={() => onSelect(stop.id)}
              aria-label={`view ${stop.name} details`}
              aria-haspopup={renderDetails ? undefined : 'dialog'}
              aria-expanded={renderDetails ? expandedStopId === stop.id : undefined}
              aria-controls={renderDetails ? `inline-stop-${stop.id}` : undefined}
              aria-current={selectedStopId === stop.id ? 'location' : undefined}
            >
              <strong>{stop.name}</strong>
              <span>{stop.address}</span>
              {(readOnly || !onSchedule) && <small className="route-summary-time">{formatTime(stop.arrival)}–{formatTime(stop.arrival + stop.mins)}</small>}
            </button>
            {!readOnly && onSchedule && <button type="button" className="route-time-edit route-summary-time" disabled={busy}
              aria-label={`edit ${stop.name} timeframe`} aria-haspopup="dialog" onClick={() => onSchedule(i)}>
              {formatTime(stop.arrival)}–{formatTime(stop.arrival + stop.mins)}
            </button>}
            {!readOnly && onSchedule && Number.isFinite(stop.cost) && <small className="route-stop-budget" title="Estimated budget allowance per person">~${stop.cost} each</small>}
            {!editing && !readOnly && onSwap && <button className="route-row-shuffle" disabled={busy} aria-label={`regenerate ${stop.name}`} onClick={() => onSwap(i)}><Shuffle size={17} /></button>}
            {!editing && (
              <button
                className="route-row-arrow"
                aria-label={`open ${stop.name} details`}
                aria-haspopup={renderDetails ? undefined : 'dialog'}
                aria-expanded={renderDetails ? expandedStopId === stop.id : undefined}
                aria-controls={renderDetails ? `inline-stop-${stop.id}` : undefined}
                onClick={() => onSelect(stop.id)}
              >
                <CircleArrowRight size={18} aria-hidden="true" />
              </button>
            )}
            {editing && (
              <div className="route-row-tools">
                <button
                  className="route-change"
                  disabled={busy}
                  onClick={() => onChange(i)}
                >
                  change spot
                </button>
                <button
                  disabled={busy || i === 0}
                  aria-label={`move ${stop.name} up`}
                  onClick={() => onMove(i, -1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  disabled={busy || i === plan.stops.length - 1}
                  aria-label={`move ${stop.name} down`}
                  onClick={() => onMove(i, 1)}
                >
                  <ArrowDown size={17} />
                </button>
                <button
                  disabled={busy || plan.stops.length === 1}
                  title={
                    plan.stops.length === 1
                      ? "Keep one stop in your route"
                      : "Remove this stop"
                  }
                  aria-label={`remove ${stop.name} from route`}
                  onClick={() => onRemove(i)}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {renderDetails && <AnimatePresence initial={false}>
              {expandedStopId === stop.id && <motion.div
                id={`inline-stop-${stop.id}`}
                role="region" aria-label={`${stop.name} stop details`}
                className="inline-stop-expansion"
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              >{renderDetails(stop, i)}</motion.div>}
            </AnimatePresence>}
            </div>
            {rows[rowIndex + 1]?.index === i + 1 && <div className="route-leg-timing" role="group"
              aria-label={`Travel from ${stop.name} to ${rows[rowIndex + 1].stop.name}`}>
              <span aria-hidden="true">{String.fromCharCode(65 + i)} → {String.fromCharCode(66 + i)} · </span>
              <span>{betweenStopsLabel(stop, rows[rowIndex + 1].stop, plan.prefs.transport)}</span>
            </div>}
          </li>
        ))}
      </ol>
      {!editing && visibleStops?.length === 0 && (
        <div className="stops-empty">
          <h3>no stops match that one.</h3>
          <button className="button" onClick={onReset}>
            show all stops
          </button>
        </div>
      )}
      {!readOnly && <button
        type="button"
        className="route-add-stop"
        aria-haspopup="dialog"
        disabled={busy || plan.stops.length >= 14}
        title={plan.stops.length >= 14 ? "Your route has the maximum 14 stops" : undefined}
        onClick={onAdd}
      >
        <span className="route-add-icon" aria-hidden="true"><Plus size={20} /></span>
        add a stop
      </button>}
    </section>
  );
}
