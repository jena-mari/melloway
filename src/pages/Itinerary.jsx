import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bookmark,
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  MapPin,
  ArrowRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { Button, MoodImage } from "../components/UI";
import { Reveal, gentleEase } from "../components/Introduction";
import { formatTime, replaceStop, directions } from "../utils/planner";
import { generate, prepareReplacement } from "../services/discovery";
import { createId } from "../utils/id";
const RouteMap = lazy(() => import("../components/RouteMap"));
export default function Itinerary() {
  const { current, setCurrent, setDraft, startNew, saved, save, setStatus } =
    useApp();
  const [expanded, setExpanded] = useState({}),
    [busy, setBusy] = useState(false),
    [busyStop, setBusyStop] = useState(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [showFilters, setShowFilters] = useState(false),
    [selectedId, setSelectedId] = useState("");
  const sheet = useRef(null),
    mapArea = useRef(null),
    gripStart = useRef(null),
    gripMoved = useRef(false);
  const reduced = useReducedMotion(),
    pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  function beginRequest(index = null) {
    pending.current?.abort();
    pending.current = new AbortController();
    setBusy(true);
    setBusyStop(index);
    return pending.current.signal;
  }
  if (!current?.plan)
    return (
      <div className="intro-screen empty">
        <h1>
          ur next good day
          <br />
          is waiting.
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
      if (next.unchanged)
        setStatus(
          "This is the best plan that fits. Try changing the details for more options.",
        );
      else if (next.plan) {
        setCurrent(next);
        setExpanded({});
        setSelectedId("");
        setQuery("");
        setCategory("all");
      } else setStatus("No other plan fits. Try changing the details.");
    } catch {
      if (!signal.aborted)
        setStatus("Couldn’t regenerate. Your current plan is safe.");
    } finally {
      if (!signal.aborted) {
        setBusy(false);
        setBusyStop(null);
      }
    }
  }
  async function swap(i) {
    const signal = beginRequest(i);
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
          id: createId(),
        },
      });
      setExpanded((old) => ({
        ...old,
        [next.stops[i].id]: !!old[plan.stops[i].id],
      }));
      setStatus("One new stop. The rest of ur day stays yours.");
    } catch {
      if (!signal.aborted)
        setStatus(
          "Couldn’t load replacement options. Your saved plan is safe.",
        );
    } finally {
      if (!signal.aborted) {
        setBusy(false);
        setBusyStop(null);
      }
    }
  }
  const location = d.area.includes("Sydney")
    ? d.area.toLowerCase().replace("anywhere in ", "")
    : `${d.area.toLowerCase()}, sydney`;
  const selectedStop = plan.stops.some((stop) => stop.id === selectedId)
    ? selectedId
    : plan.stops[0].id;
  const searchable = (value) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const shownStops = plan.stops
    .map((stop, index) => ({ stop, index }))
    .filter(
      ({ stop }) =>
        (category === "all" || category === stop.category) &&
        searchable(
          [stop.name, stop.category, stop.address, ...stop.tags].join(" "),
        ).includes(searchable(query.trim())),
    );
  function scrollTo(el, block = "start") {
    el?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block });
  }
  function chooseStop(id) {
    setSelectedId(id);
    setQuery("");
    setCategory("all");
    const index = plan.stops.findIndex((stop) => stop.id === id);
    requestAnimationFrame(() =>
      scrollTo(document.getElementById(`stop-${index}`), "center"),
    );
  }
  function clearFilters() {
    setQuery("");
    setCategory("all");
  }
  return (
    <div className="page itinerary wireframe-result map-result">
      <div className="result-chrome">
        <header className="result-header">
          <Link className="result-brand" to="/" aria-label="melloway home">
            m
          </Link>
          <div className="result-intro">
            <h1>here’s ur {d.mode === "date" ? "date" : "hangout"}!</h1>
          </div>
          <button
            className="result-bookmark"
            aria-label={isSaved ? "sync saved plan" : "save this plan"}
            onClick={() => save(plan)}
          >
            <Bookmark size={22} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </header>
        <div className="result-searchbar">
          <label className="result-search">
            <Search size={20} />
            <span className="sr-only">search ur stops</span>
            <input
              type="search"
              value={query}
              placeholder="search ur stops or cuisine"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {query && (
            <button
              className="search-clear"
              aria-label="clear search"
              onClick={() => setQuery("")}
            >
              <X size={18} />
            </button>
          )}
          <button
            className={`result-filter-toggle ${showFilters ? "active" : ""}`}
            aria-label="filter stops"
            aria-expanded={showFilters}
            aria-controls="result-filters"
            onClick={() => setShowFilters((old) => !old)}
          >
            <SlidersHorizontal size={21} />
          </button>
        </div>
        {showFilters && (
          <div className="result-filters" id="result-filters">
            <label htmlFor="stop-category">show me</label>
            <select
              id="stop-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">all stops</option>
              {[...new Set(plan.stops.map((stop) => stop.category))].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
                  </option>
                ),
              )}
            </select>
            {(category !== "all" || query) && (
              <button onClick={clearFilters}>reset</button>
            )}
          </div>
        )}
      </div>
      <div className="result-route" ref={mapArea}>
        <Suspense
          fallback={
            <div className="route-map-hero map-loading" role="status">
              bringing ur day into view…
            </div>
          }
        >
          <RouteMap
            stops={plan.stops}
            transport={d.transport}
            selectedStopId={selectedStop}
            onSelectStop={chooseStop}
          />
        </Suspense>
      </div>
      <section className="result-sheet" ref={sheet} aria-label="Planned stops">
        <button
          className="sheet-grip"
          aria-label="view stop cards"
          onPointerDown={(e) => {
            gripStart.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (gripStart.current === null) return;
            const distance = e.clientY - gripStart.current;
            if (Math.abs(distance) > 30) {
              gripMoved.current = true;
              scrollTo(distance < 0 ? sheet.current : mapArea.current);
            }
            gripStart.current = null;
          }}
          onPointerCancel={() => {
            gripStart.current = null;
            gripMoved.current = false;
          }}
          onClick={() => {
            if (gripMoved.current) gripMoved.current = false;
            else scrollTo(sheet.current);
          }}
        >
          <span />
        </button>
        <Reveal className="plan-summary" delay={0.05}>
          <p className="sheet-count" role="status">
            {shownStops.length === plan.stops.length
              ? `${plan.stops.length} little stops for ur day`
              : `${shownStops.length} of ${plan.stops.length} stops`}
          </p>
          <h2>
            {location} {d.mode === "date" ? "date" : "hangout"}
          </h2>
          <div className="summary-stats">
            <span>~${plan.cost} each</span>
            <span>
              {Math.floor(plan.elapsed / 60)}h {Math.round(plan.elapsed % 60)}m
            </span>
            <span>{d.transport}</span>
          </div>
          <details className="plan-overview">
            <summary>
              <span className="sr-only">ur plan at a glance</span>{" "}
              <ChevronDown size={18} />
            </summary>
            <p className="summary-company">
              {d.partner
                ? `${d.name || "you"} & ${d.partner}`
                : "you & good company"}{" "}
              ·{" "}
              {new Date(d.date + "T12:00:00").toLocaleDateString("en-AU", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
            <ol className="summary-stops">
              {plan.stops.map((stop, i) => (
                <li key={i}>
                  {activityLabel(stop.category)} @ {stop.name}
                </li>
              ))}
            </ol>
          </details>
        </Reveal>
        <section
          id="plan-stops"
          aria-label="Your itinerary"
          className="stop-list result-stops"
        >
          {shownStops.map(({ stop: s, index: i }) => (
            <article
              className="stop-wrap"
              key={i}
              id={`stop-${i}`}
              data-stop-position={i}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  className={`stop-card ${selectedStop === s.id ? "selected-stop" : ""}`}
                  key={s.id}
                  initial={reduced ? false : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 1 } : { opacity: 0, x: -8 }}
                  transition={{
                    duration: reduced ? 0 : 0.18,
                    ease: gentleEase,
                  }}
                >
                  <div className="stop-photo">
                    <MoodImage
                      src={s.image}
                      alt={
                        s.source === "demo"
                          ? "Illustrative mood photograph"
                          : ""
                      }
                    />
                    <span className="stop-time">
                      0{i + 1} · {formatTime(s.arrival)}
                    </span>
                    <span className="stop-allowance">~${s.cost} each</span>
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
                    <div className="stop-title-row">
                      <h2>{s.name}</h2>
                      <button
                        className="stop-map-button"
                        aria-label={`show ${s.name} on map`}
                        aria-pressed={selectedStop === s.id}
                        onClick={() => {
                          setSelectedId(s.id);
                          scrollTo(mapArea.current);
                        }}
                      >
                        <MapPin size={20} />
                      </button>
                    </div>
                    <p className="stop-meta">
                      {s.category.toLowerCase()} · {s.address}
                    </p>
                    <div className="stop-actions">
                      <button
                        aria-expanded={!!expanded[s.id]}
                        aria-controls={`details-${i}`}
                        onClick={() =>
                          setExpanded((old) => ({ ...old, [s.id]: !old[s.id] }))
                        }
                      >
                        the details{" "}
                        <ChevronDown
                          size={17}
                          style={{
                            transform: expanded[s.id]
                              ? "rotate(180deg)"
                              : "none",
                          }}
                        />
                      </button>
                      <button disabled={busy} onClick={() => swap(i)}>
                        <RefreshCw size={13} />
                        {busy && busyStop === i ? "finding…" : "swap this stop"}
                      </button>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {expanded[s.id] && (
                      <motion.div
                        id={`details-${i}`}
                        className="detail-reveal"
                        initial={reduced ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={
                          reduced ? { opacity: 1 } : { height: 0, opacity: 0 }
                        }
                        style={{ overflow: "hidden" }}
                        transition={{
                          duration: reduced ? 0 : 0.22,
                          ease: gentleEase,
                        }}
                      >
                        <div className="stop-detail">
                          <div className="stop-kicker">
                            <span>
                              {formatTime(s.arrival)} · {s.mins} min visit
                            </span>
                            <span>
                              {s.cost ? `~$${s.cost} each` : "$0 allowance"}
                            </span>
                          </div>
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
                          {i > 0 && (
                            <p className="stop-travel">
                              from the last stop: {s.travelFromPrevious.minutes}{" "}
                              min {d.transport.toLowerCase()} ·{" "}
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
                          <Link to={`/venue/${s.id}`}>
                            location spotlight <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>
            </article>
          ))}
        </section>
        {!shownStops.length && (
          <div className="stops-empty">
            <Search size={24} />
            <h3>no stops match that one.</h3>
            <p>try another name or cuisine. ur full day is still here.</p>
            <button className="button" onClick={clearFilters}>
              show all stops
            </button>
          </div>
        )}
        <div className="result-next">
          <p>
            you can lock this in or explore our community for more ideas. swap a
            stop, tweak the details — make it ur kinda day.
          </p>
          <div className="result-actions">
            <Button
              className={isSaved ? "green" : "pink"}
              onClick={() => save(plan)}
            >
              <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} />
              {isSaved ? "saved · sync again" : "lock this in"}
            </Button>
            <Link className="button" to="/community">
              explore community <ArrowUpRight size={16} />
            </Link>
          </div>
          <button
            className="text-button result-regenerate"
            disabled={busy}
            onClick={regenerate}
          >
            <RefreshCw size={14} />
            {busy && busyStop === null
              ? "finding another…"
              : "try another plan"}
          </button>
        </div>
        <details className="data-notice plan-disclosure">
          <summary>
            {plan.stops[0].source === "demo"
              ? "demo plan · sample places, costs & travel"
              : "Google Places · estimated costs & travel"}
          </summary>
          <p>
            {plan.notice}{" "}
            {plan.source === "estimate"
              ? "Travel is a rough estimate, not a calculated road or transit route."
              : "Google route times are estimates. Transit is queried for the outing’s Sydney start time; later connections may differ."}{" "}
            {d.transport === "Walking"
              ? "Walking has no transport allowance."
              : `Budget includes a sample $${plan.transportAllowance} transport allowance per person, not a fare quote.`}
          </p>
        </details>
        {d.notes && (
          <details className="plan-notes">
            <summary>ur little notes</summary>
            <p>{d.notes}</p>
            <span>
              Specific requests are notes for your outing; venue availability
              and dietary needs aren’t verified.
            </span>
          </details>
        )}
        <div className="plan-tools result-tools">
          <a
            className="button green"
            target="_blank"
            rel="noreferrer"
            href={directions(plan.stops, d.transport)}
          >
            open Google Maps <ArrowUpRight size={16} />
          </a>
          <Link
            className="button"
            to="/plan/details"
            onClick={() => {
              const { selectedPreferences, ...answers } = d;
              setDraft({
                ...answers,
                preferences: selectedPreferences || d.preferences,
              });
            }}
          >
            tweak the details
          </Link>
          <Link className="text-button" to="/" onClick={startNew}>
            start a new plan <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function activityLabel(category) {
  return (
    {
      "Matcha cafés": "a little matcha",
      "Coffee shops": "coffee + a catch-up",
      "Vintage stores": "vintage shopping",
      Bookshops: "bookshop browsing",
      "Photo spots": "cute photos",
      "Art galleries": "a gallery wander",
      "Flea markets": "market finds",
      "Scenic walks": "a little wander",
      "Café food": "a café stop",
      Desserts: "something sweet",
    }[category] || category.toLowerCase()
  );
}
