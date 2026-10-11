import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart,
  Bookmark,
  MapPin,
  CalendarDays,
  Ticket,
  ArrowUpRight,
  Search,
  Instagram,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { events } from "../data/events";
import { sydneyEvents, upcomingSydneyEvents } from "../data/sydneyEvents.js";
import SydneyEventHighlights from "../components/SydneyEventHighlights.jsx";
import EventPoster from "../components/EventPoster";
import Hack48Media from "../components/Hack48Media.jsx";
import { loadHack48 } from "../services/hack48.js";
import BrandLogo from "../components/BrandLogo";
import { readLocal, writeLocal } from "../services/storage";
import { planningArea } from "../utils/location";
import { eventQuery, loadEvents, eventPostFromTicketmaster } from "../services/events";
import { loadInstagramEvents, savedInstagramEvents } from "../services/instagramEvents.js";
import { sydneyToday } from "../utils/date.js";

function EventPost({ event, liked, onLike, focused, onMediaChange }) {
  const { savedEvents, toggleEventSave, draft, update } = useApp();
  const navigate = useNavigate();
  const article = useRef(null);
  const kept = savedEvents.includes(event.id);
  const instagram = event.source === "instagram";
  const ticketmaster = event.source === "ticketmaster";
  const organiser = event.source === "organiser";
  const shared = event.source === "shared";
  const real = ticketmaster || instagram || organiser || shared;
  useEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() =>
      article.current?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  return (
    <article
      ref={article}
      id={`event-${event.id}`}
      className="event-post"
      aria-labelledby={`event-title-${event.id}`}
    >
      <header className="event-host">
        <span
          className={`event-host-avatar poster-${event.theme}`}
          aria-hidden="true"
        >
          {instagram ? <Instagram size={20} /> : event.handle?.startsWith("melloway.") ? <BrandLogo decorative /> : event.initials}
        </span>
        <div>
          <strong>{event.host}</strong>
          {event.handle && <span>@{event.handle}</span>}
        </div>
        <span className="event-sample-label">{instagram ? "Instagram" : ticketmaster ? "Ticketmaster" : organiser ? "organiser" : shared ? "user-added event" : "sample event"}</span>
      </header>
      <EventPoster event={event} />
      {!ticketmaster && !shared && <div className="event-social-actions">
        <button
          type="button"
          aria-label={`Like event ${event.title}`}
          aria-pressed={liked}
          onClick={onLike}
        >
          <Heart size={22} fill={liked ? "currentColor" : "none"} />
          {liked ? "liked" : "like"}
        </button>
        <button
          type="button"
          aria-label={`${kept ? "Unsave" : "Save"} event ${event.title}`}
          aria-pressed={kept}
          onClick={() => toggleEventSave(event.id)}
        >
          <Bookmark size={21} fill={kept ? "currentColor" : "none"} />
          {kept ? "saved" : "save"}
        </button>
      </div>}
      <div className="event-post-details">
        <span className="event-category">{event.type}</span>
        <h2 id={`event-title-${event.id}`}>{event.title}</h2>
        <p>{event.text}</p>
        <dl className="event-facts">
          <div>
            <dt>
              <CalendarDays size={15} aria-hidden="true" />
              when
            </dt>
            <dd>{real ? event.when : "date & time TBA"}</dd>
          </div>
          <div>
            <dt>
              <MapPin size={15} aria-hidden="true" />
              where
            </dt>
            <dd>{shared ? event.address : real ? event.area : `${event.area}, Sydney · venue TBA`}</dd>
          </div>
          {!instagram && <div>
            <dt>
              <Ticket size={15} aria-hidden="true" />
              entry
            </dt>
            <dd>{real ? event.entry : "price not confirmed"}</dd>
          </div>}
        </dl>
        {!instagram && <details className="event-more-details" open={focused || undefined}>
          <summary>more about this one</summary>
          <p>{event.details}</p>
          {!real && <p className="event-sample-copy">
            This is a sample idea. Dates, venue, tickets and availability need a
            confirmed event listing.
          </p>}
        </details>}
        {shared ? <Hack48Media event={event} onChange={onMediaChange} /> : organiser ? <div className="organiser-event-links">
          <a className="text-button" href={event.url} target="_blank" rel="noopener noreferrer">event details <ArrowUpRight size={16} /></a>
          <a className="text-button" href={event.instagramUrl} target="_blank" rel="noopener noreferrer"><Instagram size={16} /> Instagram <ArrowUpRight size={16} /></a>
        </div> : instagram ? <a className="text-button event-plan-vibe" href={event.url} target="_blank" rel="noopener noreferrer">
          view original post <ArrowUpRight size={16} />
        </a> : ticketmaster ? (event.bookingUrl && <a className="text-button event-plan-vibe" href={event.bookingUrl} target="_blank" rel="noopener noreferrer">
          view tickets on Ticketmaster <ArrowUpRight size={16} />
        </a>) : <button
          type="button"
          className="text-button event-plan-vibe"
          onClick={() => {
            update({
              area: event.area,
              location: null,
              locationQuery: event.area,
              preferences: [...new Set([...draft.preferences, ...event.tags])],
            });
            navigate("/plan/vibes");
          }}
        >
          plan around this vibe <ArrowUpRight size={16} />
        </button>}
      </div>
    </article>
  );
}
export function Events() {
  const [search, setSearch] = useSearchParams();
  const focused = search.get("event");
  const hack48Focused = focused === "hack48-2026";
  const { savedEvents, setStatus, draft } = useApp();
  const requestQuery = eventQuery({ ...draft, location: planningArea(draft) });
  const [live, setLive] = useState({ query: "", loading: true, error: "", data: null });
  useEffect(() => {
    if (hack48Focused) return;
    const controller = new AbortController();
    setLive({ query: requestQuery, loading: true, error: "", data: null });
    loadEvents(requestQuery, controller.signal).then(data => {
      if (!controller.signal.aborted) setLive({ query: requestQuery, loading: false, error: "", data });
    }).catch(error => {
      if (!controller.signal.aborted) setLive({ query: requestQuery, loading: false, error: error.message, data: null });
    });
    return () => controller.abort();
  }, [requestQuery, hack48Focused]);
  const liveData = live.query === requestQuery ? live.data : null;
  const [instagram, setInstagram] = useState({ loading: true, posts: [], error: "", available: true });
  useEffect(() => {
    if (hack48Focused) return;
    const controller = new AbortController();
    loadInstagramEvents(controller.signal).then(result => {
      if (!controller.signal.aborted) setInstagram({ ...result, loading: false, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setInstagram({ loading: false, posts: [], available: true, error: error.message || "Instagram posts are unavailable right now." });
    });
    return () => controller.abort();
  }, [hack48Focused]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [likes, setLikes] = useState(() => {
    const data = readLocal("melloway.eventLikes", []);
    return Array.isArray(data) ? data : [];
  });
  const [shared, setShared] = useState({ event: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    loadHack48(controller.signal).then(event => {
      if (!controller.signal.aborted) setShared({ event, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setShared({ event: null, error: error.message });
    });
    return () => controller.abort();
  }, []);
  const sharedFeed = shared.event && visibleShared(shared.event) ? [shared.event] : [];
  function visibleShared(event) {
    return (!focused || focused === event.id) && (focused || filter === "all" || filter === event.type)
      && (!query.trim() || [event.title, event.area, event.address, event.text].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  }
  function like(id) {
    const next = likes.includes(id)
      ? likes.filter((item) => item !== id)
      : [...likes, id];
    try {
      writeLocal("melloway.eventLikes", next);
      setLikes(next);
    } catch {
      setStatus("Unable to store this like.");
    }
  }
  function browse(value) {
    setFilter(value);
    if (focused) setSearch({});
  }
  const text = query.trim().toLowerCase();
  const visible = (event) =>
      (focused
        ? event.id === focused
        : filter === "all" ||
          (filter === "saved"
            ? savedEvents.includes(event.id)
            : filter === "liked"
              ? likes.includes(event.id)
              : filter === event.type)) &&
      (!text ||
        [
          event.title,
          event.host,
          event.handle,
          event.area,
          event.type,
          event.text,
        ]
          .join(" ")
          .toLowerCase()
          .includes(text.replace(/^@/, "")));
  // Keep previously saved sample links accessible, but never recommend them.
  const feed = focused || filter === "saved" || filter === "liked" ? events.filter(visible) : [];
  const highlights = (focused || filter === "saved" || filter === "liked" ? sydneyEvents : upcomingSydneyEvents()).filter(visible);
  const archived = savedInstagramEvents();
  const instagramFeed = (focused || filter === "saved" || filter === "liked"
    ? [...new Map([...instagram.posts, ...archived].map(post => [post.id, post])).values()]
    : instagram.posts.filter(post => post.endDate >= sydneyToday())).filter(visible);
  const matching = (liveData?.events || []).map(eventPostFromTicketmaster).filter(visible);
  const unknown = (liveData?.unknownPriceEvents || []).map(eventPostFromTicketmaster).filter(visible);
  const renderPost = event => <EventPost key={event.id} event={event} focused={focused === event.id}
    liked={likes.includes(event.id)} onLike={() => like(event.id)}
    onMediaChange={event => setShared({ event, error: "" })} />;
  return (
    <div className="page events-page">
      <header className="events-heading">
        <h1>what’s on?</h1>
        <Link to="/favourites?tab=events" aria-label="view saved events">
          <Bookmark size={20} />
          <span>{savedEvents.length || "saved"}</span>
        </Link>
      </header>
      <label className="community-search events-search" htmlFor="event-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">search events</span>
        <input
          id="event-search"
          type="search"
          value={query}
          placeholder="find a vibe, area or event"
          onChange={(e) => {
            setQuery(e.target.value);
            if (focused) setSearch({});
          }}
        />
      </label>
      <div className="event-feed-filters" role="group" aria-label="event feed">
        {[
          "all",
          "saved",
          "liked",
          "markets",
          "festivals",
          "exhibitions",
          "concerts",
          "community",
        ].map((tab) => (
          <button
            type="button"
            key={tab}
            aria-pressed={!focused && filter === tab}
            onClick={() => browse(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {(sharedFeed.length > 0 || shared.error && (!focused || focused === "hack48-2026")) && <section className="event-feed" aria-label="Shared Hack48 event">
        {sharedFeed.map(renderPost)}
        {shared.error && <p role="alert">{shared.error}</p>}
      </section>}
      {focused ? highlights.map(renderPost) : <SydneyEventHighlights events={highlights} />}
      {(!focused || focused.startsWith("instagram:")) && <section className="instagram-events" aria-label="Sydney events from Instagram">
        <div className="instagram-events-heading">
          <h2>from Instagram</h2>
          <a href="https://www.instagram.com/explore/search/keyword/?q=sydney&hl=en" target="_blank" rel="noopener noreferrer">browse <ArrowUpRight size={14} /></a>
        </div>
        {!!instagramFeed.length && <div className="event-feed">{instagramFeed.map(renderPost)}</div>}
        {!instagramFeed.length && <p className="events-preview-note" aria-live="polite">
          {instagram.loading ? "Finding Sydney posts…" : instagram.error || (instagram.available ? "No matching upcoming posts found." : "Browse Sydney posts on Instagram.")}
        </p>}
        {!!instagramFeed.length && <p className="events-preview-note">Check the original post for times and tickets.</p>}
      </section>}
      {focused && (
        <button
          type="button"
          className="text-button event-browse-all"
          onClick={() => browse("all")}
        >
          back to all events
        </button>
      )}
      {!hack48Focused && <p className="events-preview-note" role="status">
        {live.loading ? "Loading Ticketmaster events for your planning details…" : live.error ||
          `Ticketmaster · ${liveData?.preferences.date} · ${liveData?.preferences.time} Sydney time · ${liveData?.preferences.duration} hours · up to $${liveData?.preferences.budget} AUD each`}
      </p>}
      {!hack48Focused && liveData && <>
        <h2>events within your advertised budget</h2>
        {!matching.length && <p className="events-preview-note">No Ticketmaster events match these details and feed filters.</p>}
        <section className="event-feed" aria-label="Ticketmaster events within budget">{matching.map(renderPost)}</section>
        {!!unknown.length && <>
          <h2>price unknown · check tickets</h2>
          <p className="events-preview-note">These start within your hours; budget fit is unconfirmed.</p>
          <section className="event-feed" aria-label="Ticketmaster events with unknown AUD prices">{unknown.map(renderPost)}</section>
        </>}
        {liveData.truncated && <p className="events-preview-note">Showing a limited Ticketmaster search; more events may exist.</p>}
      </>}
      {!!feed.length && <section className="event-feed" aria-label="saved sample events">
        {feed.map(renderPost)}
      </section>}
      {!feed.length && !highlights.length && !instagramFeed.length && !matching.length && !unknown.length && !sharedFeed.length && (
        <div className="community-empty">
          <h2>
            {text
              ? "nothing like that here yet."
              : filter === "saved"
                ? "save a little possibility."
                : filter === "liked"
                  ? "find something u love."
                  : "no posters here yet."}
          </h2>
          <p>
            {text
              ? "try another vibe or a Sydney area."
              : filter === "saved"
                ? "tap a bookmark on a poster to keep it here."
                : "browse the feed to find ur next good day."}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery("");
              browse("all");
            }}
          >
            see all events
          </button>
        </div>
      )}
    </div>
  );
}
