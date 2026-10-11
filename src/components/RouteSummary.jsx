import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { formatTime } from "../utils/planner";

export default function RouteSummary({
  plan,
  location,
  busy,
  onMove,
  onRemove,
  onChange,
  onAdd,
  onSelect,
}) {
  const [editing, setEditing] = useState(false);
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
        <button
          className="route-edit-toggle"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? (
            "done"
          ) : (
            <>
              <Pencil size={14} /> edit
            </>
          )}
        </button>
      </div>
      <ol className={`route-summary-list ${editing ? "editing" : ""}`}>
        {plan.stops.map((stop, i) => (
          <li key={stop.id}>
            <span className="route-letter" aria-hidden="true">
              {String.fromCharCode(65 + i)}
            </span>
            <button
              className="route-summary-spot"
              onClick={() => onSelect(stop.id)}
              aria-label={`view ${stop.name} details`}
            >
              <strong>{stop.name}</strong>
              <span>
                {formatTime(stop.arrival)} · ~${stop.cost}
              </span>
            </button>
            {!editing && (
              <ChevronRight
                className="route-row-chevron"
                size={18}
                aria-hidden="true"
              />
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
      <button
        className="route-add-stop"
        disabled={busy || plan.stops.length >= 14}
        onClick={onAdd}
      >
        <Plus size={17} /> add a stop
      </button>
      <div className="route-summary-total" aria-live="polite">
        <strong>
          {Math.floor(plan.elapsed / 60)}h {Math.round(plan.elapsed % 60)}m
          total
        </strong>
        <span>
          ~${plan.cost} each · {plan.travel} min travel
        </span>
      </div>
      <p className="route-summary-footnote">
        {plan.prefs.transport} · estimated
        {plan.stops.length === 1 && editing ? " · keep at least one stop" : ""}
      </p>
    </section>
  );
}
