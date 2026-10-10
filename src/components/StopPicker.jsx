import { useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";

export default function StopPicker({ choices, replacing, onChoose, onClose }) {
  const dialog = useRef(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const shown = choices.filter(({ venue }) =>
    `${venue.name} ${venue.category} ${venue.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  return (
    <dialog
      ref={dialog}
      className="stop-picker-dialog"
      aria-labelledby="stop-picker-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="stop-picker-content">
        <header>
          <div>
            <p>make it ur own</p>
            <h2 id="stop-picker-title">
              {replacing ? "pick another spot." : "one more little stop?"}
            </h2>
          </div>
          <button
            autoFocus
            aria-label="close stop picker"
            onClick={() => dialog.current.close()}
          >
            <X size={22} />
          </button>
        </header>
        <label className="stop-picker-search">
          <Search size={18} />
          <span className="sr-only">search available spots</span>
          <input
            type="search"
            placeholder="food, shopping, photobooths…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="stop-picker-hint">
          {replacing
            ? "Ur other stops stay in the same order."
            : "We’ll slot it in where it fits best."}{" "}
          Budget, travel and opening hours are checked.
        </p>
        <ul>
          {shown.map(({ venue, next }) => (
            <li key={venue.id}>
              <div>
                <strong>{venue.name}</strong>
                <span>
                  {venue.category.toLowerCase()} · {venue.mins} min · ~$
                  {venue.cost}
                </span>
                <small>
                  {venue.source === "demo" ? "sample spot" : venue.address}
                </small>
                {!next && (
                  <small className="stop-fit-warning">
                    doesn’t fit ur budget, time or opening hours
                  </small>
                )}
              </div>
              <button
                disabled={!next}
                aria-label={`${replacing ? "choose" : "add"} ${venue.name}`}
                onClick={() => {
                  dialog.current.close();
                  onChoose(venue);
                }}
              >
                <Plus size={20} />
              </button>
            </li>
          ))}
        </ul>
        {!shown.length && (
          <p className="stops-empty">
            no available spots match. try another search.
          </p>
        )}
      </div>
    </dialog>
  );
}
