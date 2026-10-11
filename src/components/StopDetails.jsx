import RecommendationEvidence from './RecommendationEvidence.jsx';
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MapPin, X, ArrowUpRight } from "lucide-react";
import { MoodImage } from "./UI";
import { formatTime } from "../utils/planner";
import VenueSocial from "./VenueSocial.jsx";

export default function StopDetails({
  stop: s,
  index,
  prefs: d,
  onClose,
  venueLink,
  venueState,
  suggestion = false,
  canAdd = false,
  busy = false,
  onAdd,
  actionLabel = "add to route",
}) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="stop-picker-dialog spot-detail-dialog"
      aria-labelledby="spot-detail-title"
      onClose={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="stop-picker-content">
        <header>
          <div>
            <p>
              {suggestion
                ? "suggested spot"
                : `stop ${String.fromCharCode(65 + index)}`}{" "}
              · {s.category.toLowerCase()}
            </p>
            <h2 id="spot-detail-title">{s.name}</h2>
          </div>
          <button
            autoFocus
            aria-label="close spot details"
            onClick={() => dialog.current.close()}
          >
            <X size={22} />
          </button>
        </header>
        {s.image && (
          <div className="spot-detail-photo">
            <MoodImage
              src={s.image}
              alt={s.source === "demo" ? "Illustrative mood photograph" : ""}
            />
            <small>
              {s.source === "demo"
                ? "mood imagery"
                : s.source === "curated"
                  ? "venue photo"
                  : `Google Places${s.attribution ? " · " + s.attribution : ""}`}
            </small>
          </div>
        )}
        <div className="stop-detail">
          <div className="stop-kicker">
            <span>
              {!suggestion && <>{formatTime(s.arrival)} · </>}
              {s.mins} min visit
            </span>
            <span>{s.cost ? `~$${s.cost} each` : "$0 allowance"}</span>
          </div>
          {Number.isFinite(s.estimatedCost) && s.cost !== s.estimatedCost && (
            <p className="stop-budget-note">
              {s.budgetCategory === "shopping"
                ? `$${Math.round((s.cost - s.estimatedCost) * 100) / 100} for purchases · ~$${s.estimatedCost} entry`
                : `$${s.cost} budget · ~$${s.estimatedCost} estimate`}
            </p>
          )}
          <p className="stop-address">
            <MapPin size={14} />
            {s.address}
          </p>
          {index > 0 && (
            <p className="stop-travel">
              {s.travelFromPrevious.minutes} min from previous stop ·{" "}
              {d.transport === 'Not selected' ? 'planning buffer · no travel mode selected' : d.transport.toLowerCase()} ·{" "}
              {s.travelFromPrevious.source === "google"
                ? "Google route estimate"
                : `rough estimate, ${s.travelFromPrevious.distance.toFixed(1)} km straight-line`}
            </p>
          )}
          <VenueSocial key={s.id} venue={s} compact />
          {s.reason && <p>{s.reason}</p>}
          {s.booking && <p>{s.booking}</p>}
          <p>{s.note}</p>
          {s.website && (
            <a href={s.website} target="_blank" rel="noreferrer">
              venue source ↗
            </a>
          )}
          <RecommendationEvidence venue={s} />
          {s.rating && <p>{s.rating}/5 · Google rating</p>}
          {suggestion ? (
            <>
              {!canAdd && (
                <p className="stop-fit-warning">
                  Doesn’t fit this plan’s time or budget.
                </p>
              )}
              <button
                className="button"
                disabled={busy || !canAdd}
                onClick={onAdd}
              >
                {actionLabel}
              </button>
            </>
          ) : (
            <Link
              className="button"
              to={venueLink || `/venue/${s.id}`}
              state={venueState}
              onClick={() => dialog.current.close()}
            >
              location spotlight <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      </div>
    </dialog>
  );
}
