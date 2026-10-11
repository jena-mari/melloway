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
  Camera,
  ArrowLeft,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { replaceExperienceStop } from "../engine/replacement";
import { Button, MoodImage } from "../components/UI";
import { gentleEase } from "../components/Introduction";
import {
  formatTime,
  replaceStop,
  directions,
  editRoute,
  addStop,
} from "../utils/planner";
import {
  generate,
  prepareReplacement,
  prepareAdditions,
  prepareRouteEdit,
} from "../services/discovery";
import { createId } from "../utils/id";
import RouteSummary from "../components/RouteSummary";
import RouteExtras from "../components/RouteExtras";
import StopPicker from "../components/StopPicker";
import StopDetails from "../components/StopDetails";
const RouteMap = lazy(() => import("../components/RouteMap"));
export default function Itinerary({
  route,
  onRouteChange,
  communityPost,
  onUseRoute,
  initialStopId = "",
}) {
  const app = useApp();
  const { setDraft, startNew, saved, save, setStatus } = app;
  const current = route || app.current;
  const setCurrent = onRouteChange || app.setCurrent;
  const [detailId, setDetailId] = useState(null),
    [picker, setPicker] = useState(null),
    [extraPool, setExtraPool] = useState(null),
    [extrasLoading, setExtrasLoading] = useState(false),
    [extrasFailed, setExtrasFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [busyStop, setBusyStop] = useState(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [showFilters, setShowFilters] = useState(false),
    [selectedId, setSelectedId] = useState(initialStopId);
  const sheet = useRef(null),
    mapArea = useRef(null),
    gripStart = useRef(null),
    gripMoved = useRef(false);
  const reduced = useReducedMotion(),
    pending = useRef(null),
    extrasPending = useRef(null),
    extrasRequest = useRef(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      extrasPending.current?.abort();
    },
    [],
  );
  // Load opt-in extras once for this route. Manual edits reuse its checked matrix.
  useEffect(() => {
    if (current?.plan) loadExtras();
  }, []);
  function beginRequest(index = null) {
    pending.current?.abort();
    pending.current = new AbortController();
    setBusy(true);
    setBusyStop(index);
    return pending.current.signal;
  }
  async function loadExtras(
    target = current?.plan,
    pool = current?.candidates || [],
  ) {
    if (!target) return null;
    extrasPending.current?.abort();
    const controller = new AbortController();
    extrasPending.current = controller;
    setExtrasLoading(true);
    setExtrasFailed(false);
    const request = prepareAdditions(target, pool, {
      signal: controller.signal,
    });
    extrasRequest.current = request;
    try {
      const options = await request;
      if (controller.signal.aborted) return null;
      setExtraPool(options);
      return options;
    } catch {
      if (!controller.signal.aborted) setExtrasFailed(true);
      return null;
    } finally {
      if (extrasRequest.current === request) extrasRequest.current = null;
      if (!controller.signal.aborted) setExtrasLoading(false);
    }
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
        setDetailId(null);
        setExtraPool(null);
        loadExtras(next.plan, next.candidates);
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
      const next =
        plan.stops.some((v) => v.source === "curated") || plan.intent
          ? replaceExperienceStop(
              plan,
              i,
              options.candidates,
              d,
              options.matrix,
            )
          : replaceStop(plan, i, options.candidates, d, options.matrix);
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
      setExtraPool(null);
      loadExtras({ ...plan, ...next }, options.candidates);
      setStatus("Stop changed.");
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
  const location = d.location
    ? d.location.name.toLowerCase()
    : d.area.includes("Sydney")
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
  function availableOptions() {
    if (
      extraPool &&
      plan.stops.every((s) => extraPool.candidates.some((v) => v.id === s.id))
    )
      return extraPool;
    return candidates.length
      ? { candidates, matrix, notice: plan.notice }
      : null;
  }
  function commitEdit(next, options, message) {
    setCurrent({
      ...current,
      ...options,
      plan: { ...plan, ...next, notice: options.notice, id: createId() },
    });
    setExtraPool(options);
    setQuery("");
    setCategory("all");
    setStatus(message);
  }
  async function editStops(stops, message) {
    const signal = beginRequest("edit");
    try {
      const options =
        availableOptions() || (await prepareRouteEdit(plan, { signal }));
      if (signal.aborted) return;
      const next = editRoute(stops, d, options.candidates, options.matrix);
      if (next) commitEdit(next, options, message);
      else
        setStatus(
          "That order doesn’t fit ur budget, time or opening hours. Try another order or tweak the details.",
        );
    } catch {
      if (!signal.aborted)
        setStatus("Couldn’t check this edit. Ur current route is still here.");
    } finally {
      if (!signal.aborted) {
        setBusy(false);
        setBusyStop(null);
      }
    }
  }
  function moveStop(index, direction) {
    const stops = [...plan.stops];
    [stops[index], stops[index + direction]] = [
      stops[index + direction],
      stops[index],
    ];
    editStops(stops, "Order updated.");
  }
  async function openPicker(index = null) {
    const signal = beginRequest("picker");
    try {
      const options =
        extraPool ||
        (await (extrasRequest.current ||
          prepareAdditions(plan, candidates, { signal })));
      if (signal.aborted) return;
      setExtraPool(options);
      setPicker({ index, options });
    } catch {
      if (!signal.aborted)
        setStatus("Couldn’t load nearby spots. Try again in a moment.");
    } finally {
      if (!signal.aborted) {
        setBusy(false);
        setBusyStop(null);
      }
    }
  }
  function choiceList(options, index = null) {
    if (!options) return [];
    return options.candidates
      .filter(
        (v) => !plan.stops.some((s) => s.id === v.id || s.name === v.name),
      )
      .map((venue) => ({
        venue,
        next:
          index === null
            ? addStop(plan, venue, options.candidates, options.matrix)
            : editRoute(
                plan.stops.map((s, i) => (i === index ? venue : s)),
                d,
                options.candidates,
                options.matrix,
              ),
      }));
  }
  function chooseAddition(venue, options = extraPool, index = null) {
    if (!options || busy) return;
    const next =
      index === null
        ? addStop(plan, venue, options.candidates, options.matrix)
        : editRoute(
            plan.stops.map((s, i) => (i === index ? venue : s)),
            d,
            options.candidates,
            options.matrix,
          );
    if (!next) {
      setStatus("That spot no longer fits. Try another or tweak the details.");
      return;
    }
    commitEdit(next, options, index === null ? "Stop added." : "Stop changed.");
    setPicker(null);
  }
  const detailIndex = plan.stops.findIndex((s) => s.id === detailId);
  const extras = choiceList(extraPool);
  return (
    <div className="page itinerary wireframe-result map-result">
      <div className="result-chrome">
        <header className="result-header">
          <Link
            className="result-brand"
            to={communityPost ? "/community" : "/"}
            aria-label={
              communityPost ? "back to community feed" : "melloway home"
            }
          >
            {communityPost ? <ArrowLeft size={20} /> : "m"}
          </Link>
          <div className="result-intro">
            <h1>
              {communityPost
                ? "the route"
                : `here’s ur ${d.mode === "date" ? "date" : "hangout"}!`}
            </h1>
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
      {communityPost && (
        <section className="community-expanded-context">
          <p>
            {communityPost.author}{" "}
            <span>
              @{communityPost.handle} ·{" "}
              {communityPost.sample ? "sample route" : "shared on ur device"}
            </span>
          </p>
          <h2>{communityPost.name}</h2>
          <p className="community-expanded-description">
            {communityPost.description}
          </p>
          <button className="button" onClick={() => onUseRoute(current)}>
            make this my day <ArrowRight size={16} />
          </button>
        </section>
      )}
      <RouteSummary
        plan={plan}
        location={location}
        busy={busy}
        onMove={moveStop}
        onRemove={(i) =>
          editStops(
            plan.stops.filter((_, index) => index !== i),
            "Stop removed.",
          )
        }
        onChange={openPicker}
        onAdd={() => openPicker()}
        onSelect={(id) => {
          setSelectedId(id);
          setDetailId(id);
        }}
      />
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
        <div className="plan-summary">
          <p className="sheet-count" role="status">
            {shownStops.length === plan.stops.length
              ? `${plan.stops.length} stops`
              : `${shownStops.length} of ${plan.stops.length} stops`}
          </p>
          <h2>the spots.</h2>
        </div>
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
                    {s.image && (
                      <MoodImage
                        src={s.image}
                        alt={
                          s.source === "demo"
                            ? "Illustrative mood photograph"
                            : ""
                        }
                      />
                    )}
                    <span className="stop-time">
                      0{i + 1} · {formatTime(s.arrival)}
                    </span>
                    <span className="stop-allowance">~${s.cost} each</span>
                    {!s.image && (
                      <span className="photo-placeholder">
                        {s.category === "Photo booths" ? (
                          <Camera size={38} strokeWidth={1.3} />
                        ) : (
                          "✳"
                        )}
                        <small>
                          {s.source === "google"
                            ? "Venue photo unavailable"
                            : s.source === "curated"
                              ? "Photo unavailable"
                              : "sample spot"}
                        </small>
                      </span>
                    )}
                    <span className="image-caption">
                      {s.source === "demo"
                        ? "mood imagery"
                        : s.source === "curated"
                          ? "sourced venue"
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
                    <p className="stop-meta">{s.address}</p>
                    <div className="stop-actions">
                      <button
                        aria-expanded={detailId === s.id}
                        aria-haspopup="dialog"
                        onClick={() => setDetailId(s.id)}
                      >
                        the details <ChevronDown size={17} />
                      </button>
                      <button disabled={busy} onClick={() => swap(i)}>
                        <RefreshCw size={13} />
                        {busy && busyStop === i ? "finding…" : "swap this stop"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </article>
          ))}
        </section>
        {!shownStops.length && (
          <div className="stops-empty">
            <Search size={24} />
            <h3>no stops match that one.</h3>
            <button className="button" onClick={clearFilters}>
              show all stops
            </button>
          </div>
        )}
        <RouteExtras
          choices={extras}
          elapsed={plan.elapsed}
          loading={extrasLoading}
          failed={extrasFailed}
          busy={busy}
          onAdd={chooseAddition}
          onRetry={() => loadExtras()}
        />
        <div className="result-next">
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
              ? "sample plan · estimates"
              : plan.stops[0].source === "curated"
                ? "venue sources · estimates"
                : "Google Places · estimates"}
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
            <summary>notes</summary>
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
      {picker && (
        <StopPicker
          choices={choiceList(picker.options, picker.index)}
          replacing={picker.index !== null}
          onChoose={(venue) =>
            chooseAddition(venue, picker.options, picker.index)
          }
          onClose={() => setPicker(null)}
        />
      )}
      {detailIndex >= 0 && (
        <StopDetails
          stop={plan.stops[detailIndex]}
          index={detailIndex}
          prefs={d}
          venueLink={
            communityPost
              ? `/community/${communityPost.id}/venue/${plan.stops[detailIndex].id}`
              : undefined
          }
          venueState={communityPost ? { route: current } : undefined}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
