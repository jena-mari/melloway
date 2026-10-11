import { Plus, RefreshCw } from "lucide-react";
import { MoodImage } from "./UI";
import { Doodle } from "./DoodleBackdrop";

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
  for (const choice of [...choices].sort(
    (a, b) =>
      Number(Boolean(b.next)) - Number(Boolean(a.next)) ||
      (b.venue.score || 0) - (a.venue.score || 0),
  )) {
    if (picks.length >= 6) break;
    if (!picks.some((pick) => pick.choice.venue.id === choice.venue.id))
      picks.push({ colour: "matcha", choice });
  }
  return (
    <section
      className="route-extras"
      aria-labelledby="route-extras-title"
      aria-busy={loading}
    >
      <h2 id="route-extras-title">more suggestions</h2>
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
          {picks.map(({ colour, choice: { venue, next } }) => (
            <li key={venue.id}>
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
                <h3>{venue.name}</h3>
                <div className="extra-actions">
                  <p>
                    ~${venue.cost}
                    {next
                      ? ` · +${Math.max(0, Math.round(next.elapsed - elapsed))} min`
                      : " · doesn’t fit"}
                  </p>
                  <button
                    disabled={busy || !next}
                    aria-label={`add ${venue.name} to route`}
                    onClick={() => onAdd(venue)}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="extras-state">no nearby suggestions.</p>
      )}
    </section>
  );
}
