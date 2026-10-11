import {
  Camera,
  IceCreamBowl,
  Footprints,
  BookOpen,
  Plus,
  RefreshCw,
} from "lucide-react";

const extraTypes = [
  {
    tag: "Photo booths",
    Icon: Camera,
    colour: "pink",
  },
  {
    tag: "Desserts",
    Icon: IceCreamBowl,
    colour: "butter",
  },
  {
    tag: "Scenic walks",
    Icon: Footprints,
    colour: "matcha",
  },
  {
    tag: "Bookshops",
    Icon: BookOpen,
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
}) {
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
  return (
    <section
      className="route-extras"
      aria-labelledby="route-extras-title"
      aria-busy={loading}
    >
      <h2 id="route-extras-title">suggestions</h2>
      {loading ? (
        <p className="extras-state" role="status">
          finding nearby spots…
        </p>
      ) : failed ? (
        <div className="extras-state">
          <p>couldn’t load suggestions.</p>
          <button onClick={onRetry} disabled={busy}>
            <RefreshCw size={14} /> try again
          </button>
        </div>
      ) : picks.length ? (
        <ul>
          {picks.map(({ Icon, colour, choice: { venue, next } }) => (
            <li key={venue.id}>
              <span className={`extra-doodle ${colour}`} aria-hidden="true">
                <Icon size={27} strokeWidth={1.4} />
              </span>
              <div>
                <h3>{venue.name}</h3>
                <p>
                  ~${venue.cost} each
                  {next
                    ? ` · +${Math.max(0, Math.round(next.elapsed - elapsed))} min`
                    : ` · ${venue.mins} min`}
                </p>
                <small>
                  {venue.source === "demo"
                    ? "sample spot"
                    : venue.source === "curated"
                      ? "sourced venue"
                      : "Google Places"}
                </small>
                {!next && (
                  <small className="stop-fit-warning">
                    doesn’t fit this plan
                  </small>
                )}
              </div>
              <button
                disabled={busy || !next}
                aria-label={`add ${venue.name} to route`}
                onClick={() => onAdd(venue)}
              >
                <Plus size={19} />
                <span>add</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="extras-state">no nearby suggestions.</p>
      )}
    </section>
  );
}
