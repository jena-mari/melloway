import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  Clock,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { Button, MoodImage } from "../components/UI";
import { formatTime, replaceStop, directions } from "../utils/planner";
import { generate, prepareReplacement } from "../services/discovery";
import RouteMap from "../components/RouteMap";
export default function Itinerary() {
  const { current, setCurrent, setDraft, startNew, saved, save, setStatus } =
      useApp(),
    [expanded, setExpanded] = useState({}),
    [busy, setBusy] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  function beginRequest() {
    pending.current?.abort();
    pending.current = new AbortController();
    setBusy(true);
    return pending.current.signal;
  }
  if (!current?.plan)
    return (
      <div className="page empty">
        <h1>
          ur next good day
          <br />
          <em>is waiting.</em>
        </h1>
        <Link to="/plan/profile" className="button pink">
          make a plan <ArrowRight size={18} />
        </Link>
      </div>
    );
  const { plan, candidates, matrix } = current,
    d = plan.prefs,
    isSaved = saved.some((p) => p.id === plan.id);
  async function regenerate() {
    const signal = beginRequest();
    try {
      const next = await generate(d, Date.now(), () => {}, plan, { signal });
      if (signal.aborted) return;
      if (next.unchanged) {
        setStatus(
          "This is the best plan that fits. Try changing the details for more options.",
        );
      } else if (next.plan) {
        setCurrent(next);
        setExpanded({});
      } else setStatus("No other plan fits. Try changing the details.");
    } catch {
      if (!signal.aborted)
        setStatus("Couldn’t regenerate. Your current plan is safe.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function swap(i) {
    const signal = beginRequest();
    try {
      const options = candidates.length
        ? { candidates, matrix, notice: plan.notice }
        : await prepareReplacement(plan, { signal });
      if (signal.aborted) return;
      const next = replaceStop(plan, i, options.candidates, d, options.matrix);
      if (!next) {
        setStatus(
          "No replacement fits while keeping the other stops. Try regenerating or changing the details.",
        );
        return;
      }
      setCurrent({
        ...current,
        ...options,
        plan: {
          ...plan,
          ...next,
          notice: options.notice,
          id: crypto.randomUUID(),
        },
      });
      setExpanded({});
      setStatus("One new stop. The rest of ur day stays yours.");
    } catch {
      if (!signal.aborted)
        setStatus(
          "Couldn’t load replacement options. Your saved plan is safe.",
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="page itinerary">
      <div className="itinerary-intro">
        <div>
          <span className="eyebrow">A DAY WITH UR NAME ON IT</span>
          <h1>
            here’s ur {d.mode === "date" ? "date" : "hangout"}.<br />
            <em>cue the chemistry.</em>
          </h1>
          <p>
            {d.partner
              ? `${d.name || "you"} & ${d.partner}`
              : "you & good company"}{" "}
            · {d.area} ·{" "}
            {new Date(d.date + "T12:00:00").toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </p>
        </div>
        <div className="itinerary-sticker">
          made
          <br />
          for <em>you</em> ♡
        </div>
      </div>
      <div className="itinerary-shortcuts">
        <Button className="pink" onClick={() => save(plan)}>
          <Bookmark size={17} fill={isSaved ? "currentColor" : "none"} />
          {isSaved ? "saved · sync again" : "save this memory"}
        </Button>
        <a className="button" href="#route-map">
          <MapPin size={17} /> the route
        </a>
      </div>
      <div className="plan-stats">
        <span>
          <MapPin size={16} />
          {plan.stops.length} little adventures
        </span>
        <span>
          <Clock size={16} />
          {Math.floor(plan.elapsed / 60)}h {Math.round(plan.elapsed % 60)}m
        </span>
        <span className="green">
          ~${plan.cost} / ${d.budget} each
        </span>
        <span>{d.transport}</span>
      </div>
      <details className="data-notice plan-disclosure">
        <summary>
          {plan.stops[0].source === "demo"
            ? "demo plan · sample places, costs & travel"
            : "Google Places · estimated costs & travel"}
        </summary>
        <p>
          <strong>
            {plan.stops[0].source === "demo" ? "DEMO PLAN" : "GOOGLE PLACES"}
          </strong>{" "}
          {plan.notice}{" "}
          {plan.source === "estimate"
            ? "Travel is a rough estimate, not a calculated road or transit route."
            : "Google route times are estimates. Transit is queried for the outing’s Sydney start time; later connections may differ."}{" "}
          {d.transport === "Walking"
            ? "Walking has no transport allowance."
            : `Budget includes a sample $${plan.transportAllowance} transport allowance per person, not a fare quote.`}
        </p>
      </details>
      <div className="itinerary-layout">
        <section aria-label="Your itinerary" className="stop-list">
          {plan.stops.map((s, i) => (
            <article className="stop-wrap" key={s.id}>
              {i > 0 && (
                <div className="travel">
                  <span className="travel-line" />
                  <span>
                    ↓{" "}
                    {s.travelFromPrevious.source === "google"
                      ? "Google route"
                      : "rough estimate"}{" "}
                    · {s.travelFromPrevious.minutes} min{" "}
                    {d.transport.toLowerCase()}{" "}
                    {s.travelFromPrevious.source === "estimate" &&
                      `· ${s.travelFromPrevious.distance.toFixed(1)} km straight-line`}
                  </span>
                </div>
              )}
              <div className="stop-card">
                <div className="stop-photo">
                  <MoodImage
                    src={s.image}
                    alt={
                      s.source === "demo" ? "Illustrative mood photograph" : ""
                    }
                  />
                  <span className="stop-number">0{i + 1}</span>
                  {!s.image && (
                    <span className="photo-placeholder">
                      ✳
                      <small>
                        {s.source === "google"
                          ? "Venue photo unavailable"
                          : "a little adventure"}
                      </small>
                    </span>
                  )}
                  <span className="image-caption">
                    {s.source === "demo"
                      ? "mood imagery"
                      : `Google Places${s.attribution ? " · " + s.attribution : ""}`}
                  </span>
                </div>
                <div className="stop-body">
                  <div className="stop-kicker">
                    <span>{formatTime(s.arrival)}</span>
                    <span>{s.cost ? `~$${s.cost} each` : "$0 allowance"}</span>
                  </div>
                  <h2>{s.name}</h2>
                  <p className="stop-address">
                    <MapPin size={13} />
                    {s.address}
                  </p>
                  <span className="category">{s.category}</span>
                  <p className="match-reason">
                    {s.tags.some((t) => d.preferences.includes(t))
                      ? `a little bit of ur ${s.tags.filter((t) => d.preferences.includes(t)).join(" + ")} vibe.`
                      : "a little variety to balance ur day."}
                  </p>
                  <div className="stop-actions">
                    <button
                      onClick={() =>
                        setExpanded((old) => ({ ...old, [s.id]: !old[s.id] }))
                      }
                      aria-expanded={!!expanded[s.id]}
                    >
                      the details <ChevronDown size={15} />
                    </button>
                    <button disabled={busy} onClick={() => swap(i)}>
                      <RefreshCw size={14} /> swap this stop
                    </button>
                  </div>
                  {expanded[s.id] && (
                    <div className="stop-detail">
                      <p>{s.note}</p>
                      <p>
                        {s.mins} min visit ·{" "}
                        {s.rating
                          ? `${s.rating}/5 · Google rating`
                          : "No verified rating or availability in demo mode."}
                      </p>
                      <Link to={`/venue/${s.id}`}>
                        location spotlight <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
        <aside className="plan-sidebar">
          <RouteMap stops={plan.stops} />
          <a
            className="button green"
            target="_blank"
            rel="noreferrer"
            href={directions(plan.stops, d.transport)}
          >
            open Google Maps <ArrowUpRight size={18} />
          </a>
          <p className="fine">
            Google Maps recalculates the real route. Demo stops are approximate
            coordinates.
          </p>
          <div className="plan-tools">
            <Button disabled={busy} onClick={regenerate}>
              <RefreshCw size={17} />
              {busy ? "finding another…" : "try another plan"}
            </Button>
            <Link
              className="button"
              to="/plan/details"
              onClick={() => setDraft(d)}
            >
              tweak the details
            </Link>
            <Link className="text-button" to="/" onClick={startNew}>
              start a new plan <ArrowRight size={16} />
            </Link>
          </div>
          <div className="sidebar-note">
            <em>the best part?</em>
            <p>
              the plan is just the beginning.
              <br />
              the memories are all yours.
            </p>
            <span>♡</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
