import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Plus, RefreshCw, MapPin, ChevronUp, ChevronDown, ArrowUpRight, LoaderCircle } from "lucide-react";
import { MoodImage } from "./UI";
import { Doodle } from "./DoodleBackdrop";

const SuggestionMap = lazy(() => import("./SuggestionMap"));

const extraTypes = [
  {
    tag: "Photo booths",
    colour: "pink",
  },
  {
    tag: "Desserts",
    colour: "butter",
  },
  {
    tag: "Scenic walks",
    colour: "matcha",
  },
  {
    tag: "Bookshops",
    colour: "lilac",
  },
];
export default function RouteExtras({
  choices,
  elapsed,
  loading,
  failed,
  busy,
  onAdd,
  onRetry,
  onView,
  browse = false,
  title = "more suggestions",
}) {
  const reduced = useReducedMotion();
  const feed = useRef(null);
  const cards = useRef(new Map());
  const [selectedId, setSelectedId] = useState(null);
  const picks = useMemo(() => {
    const picks = [];
    for (const type of extraTypes) {
      const eligible = choices
        .filter(
          ({ venue }) =>
            venue.tags.includes(type.tag) &&
            !picks.some((pick) => pick.choice.venue.id === venue.id),
        )
        .sort((a, b) => (b.venue.score || 0) - (a.venue.score || 0));
      const choice = eligible.find(({ next }) => next) || eligible[0];
      if (choice) picks.push({ ...type, choice });
    }
    for (const choice of [...choices].sort(
      (a, b) =>
        Number(Boolean(b.next)) - Number(Boolean(a.next)) ||
        (b.venue.score || 0) - (a.venue.score || 0),
    )) {
      if (!picks.some((pick) => pick.choice.venue.id === choice.venue.id))
        picks.push({ colour: "matcha", choice });
    }
    return picks;
  }, [choices]);
  const venues = useMemo(() => picks.map(({ choice }) => choice.venue), [picks]);
  const activeIndex = Math.max(0, venues.findIndex((venue) => venue.id === selectedId));
  const active = venues[activeIndex];

  function showSpot(id) {
    const card = cards.current.get(id);
    if (!card || !feed.current) return;
    setSelectedId(id);
    feed.current.scrollTo({
      top: card.getBoundingClientRect().top - feed.current.getBoundingClientRect().top + feed.current.scrollTop - feed.current.clientTop,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  useEffect(() => {
    if (!feed.current || loading || failed) return;
    const ratios = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => ratios.set(entry.target.dataset.venueId, entry.intersectionRatio));
      const visible = [...ratios].sort((a, b) => b[1] - a[1])[0];
      if (visible?.[1] >= 0.5) setSelectedId(visible[0]);
    }, { root: feed.current, threshold: [0, 0.25, 0.5, 0.75, 1] });
    cards.current.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [picks, loading, failed]);

  return (
    <section
      className="route-extras"
      aria-labelledby="route-extras-title"
      aria-busy={loading}
    >
      <header className="suggestion-browser-header">
        <h2 id="route-extras-title">{title}</h2>
        {!loading && !failed && active && <nav aria-label="Browse suggested spots">
          <button type="button" aria-label="Previous suggested spot" disabled={activeIndex === 0} onClick={() => showSpot(venues[activeIndex - 1].id)}><ChevronUp size={18} /></button>
          <button type="button" aria-label="Next suggested spot" disabled={activeIndex === venues.length - 1} onClick={() => showSpot(venues[activeIndex + 1].id)}><ChevronDown size={18} /></button>
        </nav>}
      </header>
      {loading ? (
        <div className="extras-loading" role="status" aria-live="polite">
          <div className="extras-loading-label">
            <LoaderCircle className="extras-loading-spinner" size={30} aria-hidden="true" />
            <strong>finding nearby spots…</strong>
          </div>
          <div className="extras-loading-preview" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
      ) : failed ? (
        <div className="extras-state">
          <p>couldn’t load suggestions.</p>
          <button onClick={onRetry} disabled={busy}>
            <RefreshCw size={14} /> try again
          </button>
        </div>
      ) : picks.length ? (
        <>
        <Suspense fallback={<div className="suggestion-map map-loading" role="status">loading map…</div>}>
          <SuggestionMap venues={venues} active={active} onSelect={showSpot} onView={id => onView(venues.find(venue => venue.id === id))} />
        </Suspense>
        <ul className="suggestion-feed" ref={feed} aria-label="Nearby spot suggestions" tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const offset = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
            if (offset) {
              event.preventDefault();
              showSpot(venues[Math.max(0, Math.min(venues.length - 1, activeIndex + offset))].id);
            }
          }}>
          {picks.map(({ colour, choice: { venue, next } }) => (
            <li key={venue.id} data-venue-id={venue.id} aria-current={venue.id === active.id ? "true" : undefined}
              ref={(node) => { if (node) cards.current.set(venue.id, node); else cards.current.delete(venue.id); }}
              onFocus={() => setSelectedId(venue.id)}>
              <button
                className={`extra-preview ${colour}`}
                aria-label={`preview ${venue.name}`}
                onClick={() => onView(venue)}
              >
                {venue.image ? (
                  <MoodImage
                    src={venue.image}
                    alt={
                      venue.source === "demo"
                        ? "Illustrative mood photograph"
                        : ""
                    }
                  />
                ) : (
                  <span className="extra-art" aria-hidden="true">
                    <Doodle
                      kind={
                        venue.tags.includes("Photo booths")
                          ? "camera"
                          : venue.tags.includes("Art galleries") || venue.tags.includes("Museums")
                            ? "palette"
                          : venue.tags.includes("Desserts")
                            ? "dessert"
                            : venue.tags.includes("Bookshops")
                              ? "book"
                              : venue.roles?.includes("shop") ||
                                  venue.tags.includes("Thrifting") ||
                                  venue.tags.includes("Flea markets")
                                ? "bag"
                                : venue.roles?.includes("meal") ||
                                    venue.roles?.includes("food")
                                  ? "plate"
                                  : venue.tags.includes("Scenic walks")
                                    ? "leaf"
                                    : venue.tags.includes("Matcha cafés") ||
                                        venue.tags.includes("Coffee shops")
                                      ? "matcha"
                                      : "flower"
                      }
                    />
                  </span>
                )}
                {venue.source === "demo" && (
                  <span className="extra-source">sample</span>
                )}
              </button>
              <div className="extra-caption">
                <h3><button type="button" className="suggestion-place" aria-label={`view ${venue.name} details`} onClick={() => onView(venue)}>
                  <span>{venue.name}</span><ArrowUpRight size={18} aria-hidden="true" />
                </button></h3>
                <p className="suggestion-address"><MapPin size={13} aria-hidden="true" />{venue.address || "Address unavailable"}</p>
                <div className="extra-actions">
                  <p>
                    ~${venue.cost}
                    {browse ? ` · ${venue.mins} min visit` : next
                      ? ` · +${Math.max(0, Math.round(next.elapsed - elapsed))} min`
                      : " · doesn’t fit"}
                  </p>
                  <button
                    disabled={busy || (!browse && !next)}
                    aria-label={browse ? `plan around ${venue.name}` : `add ${venue.name} to route`}
                    onClick={() => onAdd(venue)}
                  >
                    {browse ? <ArrowUpRight size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="suggestion-feed-count" aria-live="polite">{activeIndex + 1} / {picks.length}</p>
        </>
      ) : (
        <p className="extras-state">no nearby suggestions.</p>
      )}
    </section>
  );
}
