import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import {
  Bookmark,
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  ArrowRight,
  Search,
  SlidersHorizontal,
  X,
  ArrowLeft,
  Navigation,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { replaceExperienceStop } from "../engine/replacement";
import { Button, MoodImage } from "../components/UI";
import {
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
import StopPicker from "../components/StopPicker";
import InlineStopDetails from "../components/InlineStopDetails";
import BudgetSplit from "../components/BudgetSplit";
import { replacementBudget } from "../utils/activityBudget";
import { reorderRoute } from '../engine/routeEditing.js';
import StopTimeframe from '../components/StopTimeframe.jsx';
const RouteMap = lazy(() => import("../components/RouteMap"));
export default function Itinerary({
  route,
  onRouteChange,
  communityPost,
  onUseRoute,
  initialStopId = "",
}) {
  const app = useApp();
  const navigate = useNavigate();
  const { state: navigationState } = useLocation();
  const { setDraft, startNew, saved, save, setStatus } = app;
  const current = route || app.current;
  const setCurrent = onRouteChange || app.setCurrent;
  const [detailId, setDetailId] = useState(null),
    [timeframeIndex, setTimeframeIndex] = useState(null),
    [showPlanOptions, setShowPlanOptions] = useState(false),
    [picker, setPicker] = useState(null),
    [extraPool, setExtraPool] = useState(null),
    [busy, setBusy] = useState(false),
    [busyStop, setBusyStop] = useState(null),
    [query, setQuery] = useState(""),
    [showSearch, setShowSearch] = useState(false),
    [category, setCategory] = useState("all"),
    [showFilters, setShowFilters] = useState(false),
    [selectedId, setSelectedId] = useState(initialStopId);
  const mapArea = useRef(null);
  const pending = useRef(null);
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
        setDetailId(null);
        setExtraPool(null);
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
  function chooseStop(id) {
    setSelectedId(id);
    setQuery("");
    setCategory("all");
    setDetailId(id);
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
  function commitEdit(next, options, message, prefs = d) {
    const committed = setCurrent({
      ...current,
      ...options,
      plan: { ...plan, ...next, prefs, notice: options.notice, id: createId() },
    });
    if (committed === false) return false;
    setExtraPool(extraPool ? options : null);
    setQuery("");
    setCategory("all");
    setStatus(message);
    return true;
  }
  async function editStops(stops, message) {
    const signal = beginRequest("edit");
    try {
      const options =
        availableOptions() || (await prepareRouteEdit(plan, { signal }));
      if (signal.aborted) return;
      const next = editRoute(stops, d, options.candidates, options.matrix);
      if (next) return commitEdit(next, options, message);
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
    return false;
  }
  async function orderRoute(mode) {
    const signal = beginRequest('order');
    try {
      const options = availableOptions() || await prepareRouteEdit(plan, { signal });
      if (signal.aborted) return;
      const { plan: next, bounded } = reorderRoute(plan, options.candidates, options.matrix, mode);
      if (!next) { setStatus('No other order fits these timeframes and opening hours. Your stops are unchanged.'); return; }
      if (next.stops.every((s, i) => s.id === plan.stops[i].id)) { setStatus('This order is already the most efficient checked.'); return; }
      commitEdit(next, options, `${mode === 'shuffle' ? 'Alternative order ready.' : 'Route optimised.'}${bounded ? ' Best of the checked orders.' : ''}`);
    } catch { if (!signal.aborted) setStatus('Couldn’t check another order. Your route is safe.'); }
    finally { if (!signal.aborted) { setBusy(false); setBusyStop(null); } }
  }
  async function changeTransport(transport) {
    const prefs = { ...d, transport };
    const signal = beginRequest('transport');
    try {
      const options = await prepareRouteEdit({ ...plan, prefs }, { signal });
      if (signal.aborted) return;
      const next = editRoute(plan.stops, prefs, options.candidates, options.matrix);
      if (!next) { setStatus('That travel mode doesn’t fit these hours, timeframes or budget. Try adjusting a stop.'); return; }
      commitEdit(next, options, transport === 'Not selected' ? 'Travel mode cleared. Times use planning buffers.' : 'Transport updated.', prefs);
    } catch { if (!signal.aborted) setStatus('Couldn’t update transport. Your route is safe.'); }
    finally { if (!signal.aborted) { setBusy(false); setBusyStop(null); } }
  }
  async function applyBudgets(activityBudgets) {
    const prefs = { ...d, activityBudgets };
    const signal = beginRequest("budget");
    try {
      const options =
        availableOptions() || (await prepareRouteEdit(plan, { signal }));
      if (signal.aborted) return;
      const checked = editRoute(
        plan.stops.map((stop) => ({
          ...stop,
          cost: stop.estimatedCost ?? stop.cost,
        })),
        prefs,
        options.candidates,
        options.matrix,
      );
      const next = checked
        ? {
            ...current,
            ...options,
            plan: { ...plan, ...checked, prefs, id: createId() },
          }
        : await generate(prefs, 0, () => {}, plan, { signal });
      if (signal.aborted) return;
      if (!next.plan)
        return "No route fits those budgets. Increase an allowance or leave it on auto.";
      setCurrent(next);
      setDetailId(null);
      setPicker(null);
      setSelectedId("");
      setQuery("");
      setCategory("all");
      setExtraPool(null);
      setStatus("Budget updated.");
    } catch {
      if (!signal.aborted)
        return "Couldn’t update the budget. Your route is still here.";
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
        (await prepareAdditions(plan, candidates, { signal }));
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
                plan.stops.map((s, i) =>
                  i === index ? replacementBudget(s, venue) : s,
                ),
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
            plan.stops.map((s, i) =>
              i === index ? replacementBudget(s, venue) : s,
            ),
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
            {communityPost ? <ArrowLeft size={20} /> : <BrandLogo decorative />}
          </Link>
          <div className="result-intro">
            <h1>
              {communityPost
                ? "the route"
                : `here’s ur ${d.mode === "date" ? "date" : "hangout"}!`}
            </h1>
          </div>
          <button className="compact-search-toggle" aria-label="Search stops" aria-expanded={showSearch}
            aria-controls="itinerary-search" onClick={() => {
              if (showSearch) { clearFilters(); setShowFilters(false); }
              setShowSearch(!showSearch);
            }}><Search size={20} /></button>
          <button
            className="result-bookmark"
            aria-label={isSaved ? "sync saved plan" : "save this plan"}
            onClick={() => save(plan)}
          >
            <Bookmark size={22} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </header>
        {showSearch && <div className="result-searchbar" id="itinerary-search">
          <label className="result-search">
            <Search size={20} />
            <span className="sr-only">search ur stops</span>
            <input
              autoFocus
              type="search"
              value={query}
              placeholder="search stops or cuisine"
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
        </div>}
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
      {plan.matchNotice && (
        <details className="plan-match-notice">
          <summary>
            closest match <ChevronDown size={13} aria-hidden="true" />
          </summary>
          <p>{plan.matchNotice.replace(/^Closest match:\s*/i, "")}</p>
        </details>
      )}
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
      <article className="generated-route-card" aria-label="Your route">
        {plan.stops.some((stop) => stop.image) && (
          <div
            className="community-photo-strip result-photo-strip"
            aria-label="Route photos"
          >
            {plan.stops
              .filter((stop) => stop.image)
              .map((stop) => (
                <button
                  key={stop.id}
                  className="community-stop-photo"
                  aria-label={`open ${stop.name} photo details`}
                  onClick={() => chooseStop(stop.id)}
                >
                  <MoodImage
                    src={stop.image}
                    alt={
                      stop.source === "demo"
                        ? "Illustrative mood photograph"
                        : ""
                    }
                  />
                  <strong>{stop.name}</strong>
                </button>
              ))}
          </div>
        )}
        <RouteSummary
          initialEditing={Boolean(!route && navigationState?.editStops)}
          plan={plan}
          selectedStopId={selectedStop}
          expandedStopId={detailId}
          renderDetails={(stop, index) => <InlineStopDetails
            stop={stop} index={index} prefs={d} busy={busy}
            canRemove={plan.stops.length > 1}
            onReplace={() => openPicker(index)}
            onRemove={() => editStops(plan.stops.filter(s => s.id !== stop.id), 'Stop removed.')}
            venueLink={communityPost ? `/community/${communityPost.id}/venue/${stop.id}` : undefined}
            venueState={communityPost ? { route: current } : undefined}
          />}
          location={location}
          busy={busy}
          visibleStops={shownStops}
          onReset={clearFilters}
          onEdit={clearFilters}
          onMove={moveStop}
          onRemove={(i) =>
            editStops(
              plan.stops.filter((_, index) => index !== i),
              "Stop removed.",
            )
          }
          onChange={openPicker}
          onSchedule={setTimeframeIndex}
          onSwap={swap}
          onOrder={orderRoute}
          onTransport={changeTransport}
          onAdd={() => openPicker()}
          onSelect={(id) => {
            setSelectedId(id);
            setDetailId(open => open === id ? null : id);
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
              date={d.date}
              time={d.time}
              selectedStopId={selectedStop}
              onSelectStop={chooseStop}
            />
          </Suspense>
        </div>
        <details className="route-summary-meta">
          <summary className="route-summary-total">
            {Math.floor(plan.elapsed / 60)}h {Math.round(plan.elapsed % 60)}m ·
            ~${plan.cost} each
            <ChevronDown size={13} aria-hidden="true" />
          </summary>
          <p>
            {d.transport === 'Not selected' ? 'Travel mode not selected · planning buffer' : d.transport} · {plan.travel} min · estimated
          </p>
          <BudgetSplit
            key={plan.id}
            plan={plan}
            busy={busy}
            onApply={applyBudgets}
          />
        </details>
        <Link className="itinerary-explore-link" to="/explore" aria-label="explore more spots">
          <span>explore more spots<small>nearby · fits ur day</small></span> <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </article>
      <section className="result-sheet" aria-label="Plan actions">
        <div className="result-next">
          {!route && <div className="date-lifecycle">
            <span className="eyebrow">{plan.status === 'in-progress' ? 'in progress' : 'upcoming'}</span>
            <Button disabled={busy} onClick={() => {
              if (plan.status === 'in-progress') {
                if (app.finishRoute()) navigate('/');
              } else app.startRoute();
            }}>{plan.status === 'in-progress' ? `finish ${d.mode === 'date' ? 'date' : 'hangout'}` : 'start ur day'} <ArrowRight size={16} /></Button>
          </div>}
          {createPortal(<div className="result-actions itinerary-sticky-actions" aria-label="Save and directions">
            <Button
              className={isSaved ? "green" : "pink"}
              aria-label={isSaved ? "saved · sync again" : "lock this in"}
              disabled={busy}
              onClick={() => save(plan)}
            >
              <Bookmark
                size={15}
                fill={isSaved ? "currentColor" : "none"}
                aria-hidden="true"
              />
              {isSaved ? "saved" : "lock this in"}
            </Button>
            <a
              className="button result-directions"
              aria-label="open Google Maps"
              target="_blank"
              rel="noreferrer"
              href={directions(plan.stops, d.transport)}
            >
              <Navigation size={16} aria-hidden="true" /> directions
            </a>
          </div>, document.body)}
          <div className="result-secondary">
            <Link to="/community" aria-label="explore community">
              community <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <button
              className="result-regenerate"
              aria-label={
                busy && busyStop === null
                  ? "finding another…"
                  : "try another plan"
              }
              disabled={busy}
              onClick={regenerate}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {busy && busyStop === null ? "finding…" : "new plan"}
            </button>
            <button
              aria-label="more plan options"
              aria-expanded={showPlanOptions}
              aria-controls="result-plan-options"
              onClick={() => setShowPlanOptions((shown) => !shown)}
            >
              <MoreHorizontal size={17} aria-hidden="true" /> more
            </button>
          </div>
        </div>
        <div
          id="result-plan-options"
          className="result-plan-options"
          hidden={!showPlanOptions}
        >
          <div className="result-tools">
            <Link
              to="/plan/details"
              aria-label="tweak the details"
              onClick={() => {
                const { selectedPreferences, ...answers } = d;
                setDraft({
                  ...answers,
                  preferences: selectedPreferences || d.preferences,
                });
              }}
            >
              <Pencil size={15} aria-hidden="true" /> edit plan
            </Link>
            <Link to="/" onClick={startNew} aria-label="start a new plan">
              <Plus size={16} aria-hidden="true" /> new plan
            </Link>
          </div>
          <details className="data-notice plan-disclosure">
            <summary>sources & estimates</summary>
            <p>
              {plan.notice}{" "}
              {plan.source === "estimate"
                ? "Travel is a rough estimate, not a calculated road or transit route."
                : "Google route times are estimates. Transit is queried for the outing’s Sydney start time; later connections may differ."}{" "}
              {d.transport === 'Not selected' ? 'Choose transport for mode-specific routes. Current times use geographic planning buffers.' : d.transport === "Walking"
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
      {timeframeIndex !== null && plan.stops[timeframeIndex] && <StopTimeframe key={plan.stops[timeframeIndex].id} stop={plan.stops[timeframeIndex]} index={timeframeIndex}
        busy={busy} onClose={() => setTimeframeIndex(null)} onApply={async values => {
          const okay = await editStops(plan.stops.map((s, i) => i === timeframeIndex ? { ...s, ...values, visitOverride: values.mins } : s), 'Timeframe updated.');
          return okay ? '' : 'This timeframe conflicts with travel, opening hours or the outing’s duration. Try another time or a shorter visit.';
        }} />}

    </div>
  );
}
