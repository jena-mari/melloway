import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bookmark, ArrowUpRight, Trash2 } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { MoodImage } from "../components/UI";
import { events } from "../data/events";
import EventPoster from "../components/EventPoster";
export default function Favourites() {
  const { saved, savedEvents, toggleEventSave, setCurrent, remove } = useApp(),
    navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const tab =
    search.get("tab") ||
    (!saved.length && savedEvents.length ? "events" : "routes");
  const keptEvents = events.filter((event) => savedEvents.includes(event.id));
  return (
    <div className="page collection">
      <span className="eyebrow">GOOD DAYS, KEPT CLOSE</span>
      <h1>
        ur little
        <br />
        <em>memory bank.</em>
      </h1>
      <p className="sub">saved on this device. ready whenever you are.</p>
      <div
        className="community-filters saved-tabs"
        role="group"
        aria-label="saved things"
      >
        {["routes", "events"].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={tab === item}
            onClick={() => setSearch({ tab: item })}
          >
            {item}{" "}
            <span>{item === "routes" ? saved.length : keptEvents.length}</span>
          </button>
        ))}
      </div>
      {tab === "events" ? (
        keptEvents.length ? (
          <div className="saved-event-list">
            {keptEvents.map((event) => (
              <article key={event.id} className="saved-event-card">
                <Link
                  to={`/events?event=${event.id}`}
                  aria-label={`View event ${event.title}`}
                >
                  <EventPoster event={event} compact />
                </Link>
                <div>
                  <span className="eyebrow">{event.type} · sample</span>
                  <h2>
                    <Link to={`/events?event=${event.id}`}>{event.title}</Link>
                  </h2>
                  <p>{event.area} · date TBA</p>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Unsave event ${event.title}`}
                    onClick={() => toggleEventSave(event.id)}
                  >
                    <Bookmark size={16} fill="currentColor" /> saved · remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="community-empty">
            <Bookmark size={30} />
            <h2>a little space for what’s next.</h2>
            <p>save an event poster to come back to it here.</p>
            <Link className="button" to="/events">
              find something to do <ArrowUpRight size={16} />
            </Link>
          </div>
        )
      ) : !saved.length ? (
        <div className="empty-state">
          <Bookmark size={36} />
          <h2>a little empty, a lot of possibility.</h2>
          <p>make a plan, save it here, and come back for round two.</p>
          <Link className="button pink" to="/plan/profile">
            find ur next good day <ArrowUpRight size={18} />
          </Link>
        </div>
      ) : (
        <div className="collection-grid">
          {saved.map((p) => (
            <article className="collection-card" key={p.id}>
              <div className="collection-photo">
                <MoodImage src={p.stops.find((s) => s.image)?.image} />
                <span className="pill-label">
                  {p.stops[0].source === "demo" ? "demo plan" : "Google Places"}
                </span>
              </div>
              <div className="collection-body">
                <span className="eyebrow">{p.prefs.area}</span>
                <h2>
                  {p.prefs.mode === "date" ? "a date" : "a hangout"} with{" "}
                  {p.prefs.partner || "good company"}
                </h2>
                <p>
                  {p.stops.length} stops · ~${p.cost} each · {p.prefs.date}
                </p>
                <div className="card-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      setCurrent({ plan: p, candidates: [], matrix: [] });
                      navigate("/itinerary");
                    }}
                  >
                    open plan <ArrowUpRight size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove plan ${p.id}`}
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
