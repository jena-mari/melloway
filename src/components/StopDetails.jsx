import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MapPin, X, ArrowUpRight } from "lucide-react";
import { MoodImage } from "./UI";
import { formatTime } from "../utils/planner";

export default function StopDetails({ stop: s, index, prefs: d, onClose }) {
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
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="stop-picker-content">
        <header>
          <div>
            <p>
              stop {String.fromCharCode(65 + index)} ·{" "}
              {s.category.toLowerCase()}
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
                : `Google Places${s.attribution ? " · " + s.attribution : ""}`}
            </small>
          </div>
        )}
        <div className="stop-detail">
          <div className="stop-kicker">
            <span>
              {formatTime(s.arrival)} · {s.mins} min visit
            </span>
            <span>{s.cost ? `~$${s.cost} each` : "$0 allowance"}</span>
          </div>
          <p className="stop-address">
            <MapPin size={14} />
            {s.address}
          </p>
          <p className="match-reason">
            {s.tags.some((t) => d.preferences.includes(t))
              ? `a little bit of ur ${s.tags.filter((t) => d.preferences.includes(t)).join(" + ")} vibe.`
              : "a little variety to balance ur day."}
          </p>
          {index > 0 && (
            <p className="stop-travel">
              from the last stop: {s.travelFromPrevious.minutes} min{" "}
              {d.transport.toLowerCase()} ·{" "}
              {s.travelFromPrevious.source === "google"
                ? "Google route estimate"
                : `rough estimate, ${s.travelFromPrevious.distance.toFixed(1)} km straight-line`}
            </p>
          )}
          <p>{s.note}</p>
          <p>
            {s.rating
              ? `${s.rating}/5 · Google rating`
              : "No verified rating or availability in demo mode."}
          </p>
          <Link
            className="button"
            to={`/venue/${s.id}`}
            onClick={() => dialog.current.close()}
          >
            location spotlight <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </dialog>
  );
}
