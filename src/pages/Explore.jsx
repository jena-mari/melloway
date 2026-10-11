import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Sparkles, ArrowUpRight } from "lucide-react";
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

export default function Explore() {
  const { current, setCurrent, draft, update, setStatus } = useApp();
  const navigate = useNavigate();
  const plan = current?.plan;
  const [query, setQuery] = useState("");
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState(null);
  const [posts] = useState(() => [...readPosts(), ...communityExamples()]);

  useEffect(() => {
    const controller = new AbortController();
    setPool(null);
    setFailed(false);
    setDetail(null);
    setLoading(true);
    const request = plan ? prepareAdditions(plan, current.candidates || [], { signal: controller.signal }) : prepareBrowse(draft, { signal: controller.signal });
    request
        .then(options => { if (!controller.signal.aborted) setPool(options); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [current, retry, draft]);

  const choices = useMemo(() => {
    const venues = pool?.candidates || [];
    return venues
      .filter(venue => !plan?.stops.some(stop => stop.id === venue.id || stop.name === venue.name))
      .map(venue => ({ venue, next: plan && pool ? addStop(plan, venue, pool.candidates, pool.matrix) : null }));
  }, [plan, pool, draft.date]);
  const text = query.trim().toLowerCase();
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
      </label>
      <RouteExtras choices={filtered} elapsed={plan?.elapsed || 0} loading={loading} failed={failed}
        browse={!plan} title={plan ? "nearby spots" : "places to go"} onAdd={choose}
        onView={setDetail} onRetry={() => setRetry(value => value + 1)} />
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
