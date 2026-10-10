import {
  Camera,
  IceCreamBowl,
  Footprints,
  BookOpen,
  Plus,
  RefreshCw,
} from "lucide-react";

export const extraTypes = [
  {
    tag: "Photo booths",
    title: "a photobooth moment",
    Icon: Camera,
    colour: "pink",
  },
  {
    tag: "Desserts",
    title: "something sweet",
    Icon: IceCreamBowl,
    colour: "butter",
  },
  {
    tag: "Scenic walks",
    title: "take the scenic way",
    Icon: Footprints,
    colour: "matcha",
  },
  {
    tag: "Bookshops",
    title: "one little browse",
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
    const eligible = choices.filter(
      ({ venue }) =>
        venue.tags.includes(type.tag) &&
        !picks.some((pick) => pick.choice.venue.id === venue.id),
    );
    const choice = eligible.find(({ next }) => next) || eligible[0];
    if (choice) picks.push({ ...type, choice });
  }
  return (
    <section
      className="route-extras"
      aria-labelledby="route-extras-title"
      aria-busy={loading}
    >
      <p className="extras-eyebrow">a little room for a detour</p>
      <h2 id="route-extras-title">a little extra?</h2>
      <p className="extras-description">
        ur main plan is set. these are just little maybes — add one if it feels
        right.
      </p>
      {loading ? (
        <p className="extras-state" role="status">
          finding little extras nearby…
        </p>
      ) : failed ? (
        <div className="extras-state">
          <p>couldn’t load nearby extras.</p>
          <button onClick={onRetry} disabled={busy}>
            <RefreshCw size={14} /> try again
          </button>
        </div>
      ) : picks.length ? (
        <ul>
          {picks.map(({ title, Icon, colour, choice: { venue, next } }) => (
            <li key={venue.id}>
              <span className={`extra-doodle ${colour}`} aria-hidden="true">
                <Icon size={27} strokeWidth={1.4} />
              </span>
              <div>
                <h3>{title}</h3>
                <strong>{venue.name}</strong>
                <p>
                  ~${venue.cost} each · {venue.mins} min
                  {next
                    ? ` · +${Math.max(0, Math.round(next.elapsed - elapsed))} min to ur day`
                    : ""}
                </p>
                <small>
                  {venue.source === "demo"
                    ? "sample spot · unverified"
                    : "Google Places · estimated allowance"}
                </small>
                {!next && (
                  <small className="stop-fit-warning">
                    doesn’t fit ur budget, time or opening hours
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
        <p className="extras-state">
          no more extras nearby just yet. ur main day is all yours.
        </p>
      )}
    </section>
  );
}
