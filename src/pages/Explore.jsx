import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Sparkles, ArrowUpRight, X } from "lucide-react";
import { useApp } from "../hooks/useApp";
import RouteExtras from "../components/RouteExtras";
import StopDetails from "../components/StopDetails";
import WeeklySuggestions from "../components/WeeklySuggestions";
import MellowayPicks from "../components/MellowayPicks";
import CommunitySuggestions from "../components/CommunitySuggestions";
import { communityExamples } from "../data/community";
import { readPosts } from "../hooks/useCommunity";
import { prepareAdditions, prepareBrowse } from "../services/discovery";
import { addStop } from "../utils/planner";
import { createId } from "../utils/id";
import { mellowayPicks } from "../data/mellowayPicks.js";
import { sydneyVenues } from "../data/sydneyVenues.js";
import { editorialPicks } from "../data/editorialPicks.js";
import { searchPlaces } from "../utils/placeSearch.ts";
import ExplorePlaces from "../components/ExplorePlaces.jsx";
import { Button } from "../components/UI";

const placeEntries = [
  ...sydneyVenues.map(venue => ({ venue, href: `/venue/${venue.id}` })),
  ...editorialPicks.map(venue => ({ venue, href: `/picks/places/${venue.id}` })),
  ...mellowayPicks.flatMap(pick => pick.stops.map(venue => ({
    venue, href: `/picks/${pick.id}/venue/${venue.id}`,
  }))),
];

export default function Explore() {
  const { current, setCurrent, draft, update, setStatus } = useApp();
  const navigate = useNavigate();
  const plan = current?.plan;
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  function setQuery(value) {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  }
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);
  const pending = useRef(null);
  const [detail, setDetail] = useState(null);
  const [posts] = useState(() => [...readPosts(), ...communityExamples()]);

  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    setPool(null);
    setFailed(false);
    setDetail(null);
    setLoading(false);
    setRequested(false);
    return () => pending.current?.abort();
  }, [current, draft]);

  async function loadSuggestions() {
    setRequested(true);
    if (pool || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setFailed(false);
    setLoading(true);
    const request = plan ? prepareAdditions(plan, current.candidates || [], { signal: controller.signal }) : prepareBrowse(draft, { signal: controller.signal });
    try {
      const options = await request;
      if (!controller.signal.aborted) setPool(options);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  const choices = useMemo(() => {
    const venues = pool?.candidates || [];
    return venues
      .filter(venue => !plan?.stops.some(stop => stop.id === venue.id || stop.name === venue.name))
      .map(venue => ({ venue, next: plan && pool ? addStop(plan, venue, pool.candidates, pool.matrix) : null }));
  }, [plan, pool, draft.date]);
  const text = query.trim().toLowerCase();
  const placeMatches = searchPlaces(placeEntries, query);
  const filtered = choices.filter(({ venue }) =>
    [venue.name, venue.address, venue.category, ...venue.tags].join(" ").toLowerCase().includes(text));
  const sharedRoutes = posts.filter(post =>
    [post.name, post.author, post.handle, post.area, ...(post.plan?.stops || []).map(stop => stop.name)]
      .join(" ").toLowerCase().includes(text));

  function choose(venue) {
    if (!plan) {
      update({
        area: venue.area,
        location: null,
        preferences: [...new Set([...draft.preferences, ...venue.tags])],
        notes: [draft.notes, `Include ${venue.name}, ${venue.address}.`].filter(Boolean).join("\n"),
      });
      navigate(draft.name.trim() ? "/plan/vibes" : "/plan/profile");
      return;
    }
    if (!pool) return;
    const next = addStop(plan, venue, pool.candidates, pool.matrix);
    if (!next) {
      setStatus("That spot doesn’t fit this plan’s time or budget.");
      return;
    }
    setCurrent({ ...current, ...pool, plan: { ...plan, ...next, notice: pool.notice, id: createId() } });
    setStatus("Stop added.");
    navigate("/itinerary");
  }

  return (
    <div className="page explore-page">
      <h1>explore.</h1>
      <label className="community-search explore-search" htmlFor="explore-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">search suggestions</span>
        <input id="explore-search" type="search" value={query} placeholder="find a place or activity"
          onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="clear search" onClick={() => setQuery("")}><X size={18} /></button>}
      </label>
      <ExplorePlaces places={placeMatches} />
      {requested ? (
        <RouteExtras choices={filtered} elapsed={plan?.elapsed || 0} loading={loading} failed={failed}
          browse={!plan} title={plan ? "nearby spots" : "places to go"} onAdd={choose}
          onView={setDetail} onRetry={loadSuggestions} />
      ) : (
        <section className="route-extras" aria-labelledby="route-extras-title" aria-busy="false">
          <h2 id="route-extras-title">{plan ? "nearby spots" : "places to go"}</h2>
          <Button className="cream" onClick={loadSuggestions}>show suggestions</Button>
        </section>
      )}
      <WeeklySuggestions query={query} />
      <MellowayPicks query={query} />
      {!!sharedRoutes.some(post => post.plan?.stops.length) && <CommunitySuggestions posts={sharedRoutes} title="shared routes" />}
      <Link className="explore-events-link" to="/events"><Sparkles size={16} aria-hidden="true" /> what’s on <ArrowUpRight size={16} aria-hidden="true" /></Link>
      {detail && <StopDetails key={detail.id} stop={detail} index={0} prefs={plan?.prefs || draft}
        suggestion canAdd={!plan || Boolean(choices.find(({ venue }) => venue.id === detail.id)?.next)}
        actionLabel={plan ? "add to route" : "plan around this"} onAdd={() => choose(detail)} onClose={() => setDetail(null)} />}
    </div>
  );
}
