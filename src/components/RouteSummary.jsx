import { useState } from "react";
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
import { formatTime } from '../utils/planner.js';

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
  readOnly = false,
  initialEditing = false,
  onSchedule,
  onSwap,
  onOrder,
  onTransport,
  selectedStopId,
}) {
  const [editing, setEditing] = useState(initialEditing && !readOnly);
  return (
    <section
      className="route-summary"
      aria-label="Route summary"
      aria-busy={busy}
    >
      <div className="route-summary-heading">
        <div>
          <h2>{location}</h2>
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
        {(editing || !visibleStops
          ? plan.stops.map((stop, index) => ({ stop, index }))
          : visibleStops
        ).map(({ stop, index: i }) => (
          <li key={stop.id} className={selectedStopId === stop.id ? 'selected-route-stop' : undefined}>
            <span className="route-letter" aria-hidden="true">
              {String.fromCharCode(65 + i)}
            </span>
            <button
              className="route-summary-spot"
              onClick={() => onSelect(stop.id)}
              aria-label={`view ${stop.name} details`}
              aria-haspopup="dialog"
              aria-current={selectedStopId === stop.id ? 'location' : undefined}
            >
              <strong>{stop.name}</strong>
              <span>{stop.address}</span>
              <small>{formatTime(stop.arrival)}–{formatTime(stop.arrival + stop.mins)}</small>
            </button>
            {!readOnly && onSchedule && <button className="route-time-edit" disabled={busy} aria-label={`edit ${stop.name} timeframe`} onClick={() => onSchedule(i)}>time</button>}
            {!editing && !readOnly && onSwap && <button className="route-row-shuffle" disabled={busy} aria-label={`regenerate ${stop.name}`} onClick={() => onSwap(i)}><Shuffle size={17} /></button>}
            {!editing && (
              <button
                className="route-row-arrow"
                aria-label={`open ${stop.name} details`}
                aria-haspopup="dialog"
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
