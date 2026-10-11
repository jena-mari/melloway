import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  CircleArrowRight,
  Pencil,
  Plus,
  X,
} from "lucide-react";

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
        </button>
      </div>
      <ol className={`route-summary-list ${editing ? "editing" : ""}`}>
        {(editing || !visibleStops
          ? plan.stops.map((stop, index) => ({ stop, index }))
          : visibleStops
        ).map(({ stop, index: i }) => (
          <li key={stop.id}>
            <span className="route-letter" aria-hidden="true">
              {String.fromCharCode(65 + i)}
            </span>
            <button
              className="route-summary-spot"
              onClick={() => onSelect(stop.id)}
              aria-label={`view ${stop.name} details`}
              aria-haspopup="dialog"
            >
              <strong>{stop.name}</strong>
              <span>{stop.address}</span>
            </button>
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
      {editing && (
        <button
          className="route-add-stop"
          disabled={busy || plan.stops.length >= 14}
          onClick={onAdd}
        >
          <Plus size={17} /> add a stop
        </button>
      )}
    </section>
  );
}
