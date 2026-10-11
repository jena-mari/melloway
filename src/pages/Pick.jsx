import { useState, lazy, Suspense } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CircleArrowRight,
  Navigation,
} from "lucide-react";
import {
  mellowayPicks,
  nextPickDate,
  pickRoute,
} from "../data/mellowayPicks.js";
import { useApp } from "../hooks/useApp.jsx";
import { Doodle } from "../components/DoodleBackdrop.jsx";
import StopDetails from "../components/StopDetails.jsx";
import { createId } from "../utils/id.js";
import { demoMatrix, directions, formatTime } from "../utils/planner.js";
import { sydneyToday } from "../utils/date.js";
import Venue from "./Venue.jsx";
import MellowayPicks from "../components/MellowayPicks.jsx";
import BrandLogo from "../components/BrandLogo";
import WeeklySuggestions from "../components/WeeklySuggestions";
const RouteMap = lazy(() => import("../components/RouteMap.jsx"));

export default function Pick() {
  const { pickId } = useParams();
  if (!pickId)
    return (
      <div className="page picks-page">
        <Link className="back" to="/community">
          <ArrowLeft size={18} /> explore
        </Link>
        <h1>melloway picks.</h1>
        <MellowayPicks showHeading={false} />
        <WeeklySuggestions />
      </div>
    );
  return (
    <PickView
      key={pickId}
      pick={mellowayPicks.find((pick) => pick.id === pickId)}
    />
  );
}
function PickView({ pick }) {
  const { id } = useParams(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { current, setCurrent, draft, saved, save, remove, setStatus } =
    useApp();
  const [date, setDate] = useState(
    () => params.get("date") || (pick ? nextPickDate(pick) : sydneyToday()),
  );
  const [detailId, setDetailId] = useState(""),
    [busy, setBusy] = useState(false);
  if (!pick)
    return (
      <div className="page">
        <h1>pick not found</h1>
        <Link to="/community">back to explore</Link>
      </div>
    );
  const route = date >= sydneyToday() ? pickRoute(pick, date) : null,
    plan = route?.plan;
  // Browsing a pick never writes the current plan or onboarding answers.
  const previewMatrix = plan ? null : demoMatrix(pick.stops, "Walking");
  const stops =
    plan?.stops ||
    pick.stops.map((stop, index) => ({
      ...stop,
      arrival: pick.suggestedArrivals[index],
      ...(index > 0 && {
        travelFromPrevious: {
          ...previewMatrix[index - 1][index],
          minutes: pick.walkingRanges[index - 1][1],
        },
      }),
    }));
  const basePath = `/picks/${pick.id}`;
  const backTo = `${basePath}?date=${encodeURIComponent(date)}`;
  if (id) return <Venue route={route || { plan: { stops } }} backTo={backTo} />;
  const isSaved = plan && saved.some((item) => item.id === plan.id);
  const detailIndex = stops.findIndex((stop) => stop.id === detailId);
  async function bookmark() {
    if (!plan) return;
    setBusy(true);
    try {
      if (isSaved) await remove(plan.id);
      else await save(plan);
    } finally {
      setBusy(false);
    }
  }
  function usePick() {
    if (!plan) return;
    setCurrent({
      ...route,
      plan: {
        ...plan,
        id: createId(),
        prefs: { ...plan.prefs, name: draft.name, partner: draft.partner },
      },
    });
    setStatus(`${pick.shortName} added to ur day.`);
    navigate("/itinerary");
  }
  return (
    <div className="page pick-page">
      <Link className="back" to="/community">
        <ArrowLeft size={18} /> explore
      </Link>
      <header className="pick-header">
        <p className="pick-eyebrow"><BrandLogo /> presents</p>
        <span className="pick-heading-doodle" aria-hidden="true">
          <Doodle kind="matcha" />
        </span>
        <h1>{pick.name}</h1>
        <p>{pick.description}</p>
        <p className="pick-area">{pick.area}</p>
      </header>
      <div className="pick-facts">
        <span>{pick.durationEstimate}</span>
        <span>walking</span>
        <span>{pick.stops.length} stops</span>
      </div>
      <div className="pick-day">
        <label htmlFor="pick-day">choose a day</label>
        <input
          id="pick-day"
          type="date"
          min={sydneyToday()}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setParams({ date: event.target.value }, { replace: true });
            setDetailId("");
          }}
        />
      </div>
      {!plan && (
        <p className="pick-day-error" role="status">
          {date && date < sydneyToday()
            ? "Choose today or a future day."
            : date
              ? "This day has no confirmed window for the full crawl. Choose another day or check the cafés’ hours."
              : "Choose a day to use this route."}
        </p>
      )}
      <p className="pick-start">
        <Navigation size={15} /> start near {pick.start} · 10:30 am
      </p>
      <ol
        className="community-place-list pick-stop-list"
        aria-label={`${pick.shortName} stops`}
      >
        {stops.map((stop, index) => (
          <li key={stop.id}>
            <button
              onClick={() => setDetailId(stop.id)}
              aria-label={`open ${stop.name} details`}
              aria-haspopup="dialog"
            >
              <span className="route-letter" aria-hidden="true">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="community-place-info">
                <strong>{stop.name}</strong>
                <small>{stop.address}</small>
                <small className="pick-stop-time">
                  {formatTime(stop.arrival)}
                  {!plan && " · suggested"}
                </small>
              </span>
              <CircleArrowRight
                size={21}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
            {index < stops.length - 1 && (
              <p className="pick-walk">
                ~{pick.walkingRanges[index].join("–")} min walk
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="community-expanded-map pick-map">
        <Suspense
          fallback={
            <div className="map-loading" role="status">
              loading map…
            </div>
          }
        >
          <RouteMap
            stops={stops}
            transport="Walking"
            selectedStopId={detailId || stops[0].id}
            onSelectStop={setDetailId}
          />
        </Suspense>
      </div>
      <p className="pick-walk-note">
        ~{pick.walkingEstimate} walking · estimated, not live routing
      </p>
      <div className="pick-actions">
        <button className="button" disabled={!plan || busy} onClick={usePick}>
          make this my day <ArrowRight size={16} />
        </button>
        <button
          className="pick-save"
          disabled={!plan || busy}
          aria-label={`${isSaved ? "unsave" : "save"} ${pick.shortName}`}
          aria-pressed={Boolean(isSaved)}
          onClick={bookmark}
        >
          <Bookmark size={20} fill={isSaved ? "currentColor" : "none"} />
        </button>
      </div>
      {current?.plan && (
        <p className="pick-current-note">
          Your current day changes when you choose “make this my day”.
        </p>
      )}
      <a
        className="pick-directions"
        href={directions(stops, "Walking")}
        target="_blank"
        rel="noopener noreferrer"
      >
        open walking directions <ArrowRight size={15} />
      </a>
      <details className="pick-notice">
        <summary>route notes</summary>
        <p>{pick.notice}</p>
        <p>
          ~${plan?.cost ?? pick.stops.reduce((sum, stop) => sum + stop.cost, 0)}{" "}
          each for drinks. Planning allowance, not a menu quote.
        </p>
        <ul>
          {pick.stops.map((stop) => (
            <li key={stop.id}>
              <a href={stop.website} target="_blank" rel="noopener noreferrer">
                {stop.name} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
      {detailIndex >= 0 && (
        <StopDetails
          stop={stops[detailIndex]}
          index={detailIndex}
          prefs={plan?.prefs || { date, time: pick.time, transport: "Walking" }}
          onClose={() => setDetailId("")}
          venueLink={`${basePath}/venue/${stops[detailIndex].id}?date=${encodeURIComponent(date)}`}
          venueState={{ route }}
        />
      )}
    </div>
  );
}
