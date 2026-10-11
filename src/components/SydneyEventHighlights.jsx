import { Link } from "react-router-dom";
import { Bookmark, Instagram, ArrowUpRight } from "lucide-react";
import { useApp } from "../hooks/useApp";
import EventPoster from "./EventPoster";

export default function SydneyEventHighlights({ events }) {
  const { savedEvents, toggleEventSave } = useApp();
  if (!events.length) return null;
  return <section className="sydney-highlights" aria-label="Upcoming Sydney highlights">
    <h2>around Sydney</h2>
    <div className="sydney-highlight-rail" tabIndex={0} aria-label="Swipe through Sydney events">
      {events.map(event => {
        const saved = savedEvents.includes(event.id);
        return <article className="sydney-event-tile" key={event.id}>
          <Link to={`/events?event=${event.id}`} aria-label={`View event ${event.title}`}>
            <EventPoster event={event} compact />
            <h3>{event.title}</h3>
          </Link>
          <p>{event.when}<br />{event.area}</p>
          <div className="sydney-highlight-actions">
            <a href={event.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={`${event.host} on Instagram`}>
              <Instagram size={16} /> Instagram <ArrowUpRight size={14} />
            </a>
            <button type="button" className="icon-button" aria-label={`${saved ? "Unsave" : "Save"} event ${event.title}`} aria-pressed={saved}
              onClick={() => toggleEventSave(event.id)}><Bookmark size={20} fill={saved ? "currentColor" : "none"} /></button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
