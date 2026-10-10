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
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { events } from "../data/events";
import EventPoster from "../components/EventPoster";
import { readLocal, writeLocal } from "../services/storage";

function EventPost({ event, liked, onLike, focused }) {
  const { savedEvents, toggleEventSave, draft, update } = useApp();
  const navigate = useNavigate();
  const article = useRef(null);
  const kept = savedEvents.includes(event.id);
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
          {event.initials}
        </span>
        <div>
          <strong>{event.host}</strong>
          <span>@{event.handle}</span>
        </div>
        <span className="event-sample-label">sample event</span>
      </header>
      <EventPoster event={event} />
      <div className="event-social-actions">
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
      </div>
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
            <dd>date & time TBA</dd>
          </div>
          <div>
            <dt>
              <MapPin size={15} aria-hidden="true" />
              where
            </dt>
            <dd>{event.area}, Sydney · venue TBA</dd>
          </div>
          <div>
            <dt>
              <Ticket size={15} aria-hidden="true" />
              entry
            </dt>
            <dd>price not confirmed</dd>
          </div>
        </dl>
        <details className="event-more-details" open={focused || undefined}>
          <summary>more about this one</summary>
          <p>{event.details}</p>
          <p className="event-sample-copy">
            This is a sample idea. Dates, venue, tickets and availability need a
            confirmed event listing.
          </p>
        </details>
        <button
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
        </button>
      </div>
    </article>
  );
}
export function Events() {
  const { savedEvents, setStatus } = useApp();
  const [search, setSearch] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [likes, setLikes] = useState(() => {
    const data = readLocal("melloway.eventLikes", []);
    return Array.isArray(data) ? data : [];
  });
  const focused = search.get("event");
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
  const feed = events.filter(
    (event) =>
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
          .includes(text.replace(/^@/, ""))),
  );
  return (
    <div className="page events-page">
      <header className="events-heading">
        <h1>what’s on?</h1>
        <p>something worth getting out for.</p>
        <Link to="/favourites?tab=events" aria-label="view saved events">
          <Bookmark size={20} />
          <span>{savedEvents.length || "saved"}</span>
        </Link>
      </header>
      <p className="events-preview-note">
        sample posters · dates & venues unconfirmed
      </p>
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
      {focused && (
        <button
          type="button"
          className="text-button event-browse-all"
          onClick={() => browse("all")}
        >
          back to all events
        </button>
      )}
      <section className="event-feed" aria-label="event poster feed">
        {feed.map((event) => (
          <EventPost
            key={event.id}
            event={event}
            focused={focused === event.id}
            liked={likes.includes(event.id)}
            onLike={() => like(event.id)}
          />
        ))}
      </section>
      {!feed.length && (
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
