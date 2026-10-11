import { useState } from "react";
import BrandLogo from "./BrandLogo";
import { sharedMediaUrl } from "../services/hack48.js";
import { ArrowUpRight } from "lucide-react";
import { EmbeddedPreview } from "./VenueSocial.jsx";

export default function EventPoster({ event, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (event.source === "shared") {
    const image = event.attachments.find(item => item.kind === "image");
    return <figure className={`organiser-event-poster${compact ? " organiser-event-compact" : ""}`}>
      {image && !imageFailed ? <img src={sharedMediaUrl(image.url)} alt="Hack48 event image" onError={() => setImageFailed(true)} />
        : <div className="organiser-art-fallback hack48-cover"><strong>{event.title}</strong><span>{event.posterSubtitle}</span></div>}
      {!compact && <figcaption>{image ? "Image uploaded for this event" : "Add an event image below"}</figcaption>}
    </figure>;
  }
  if (event.source === "organiser") return <figure className={`organiser-event-poster${compact ? " organiser-event-compact" : ""}`}>
    {imageFailed ? <div className="organiser-art-fallback"><BrandLogo decorative /></div> :
      <img src={event.image} alt={event.imageAlt} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
    <figcaption>{event.imageCredit}</figcaption>
  </figure>;
  if (event.source === "instagram") {
    const preview = <div className={`instagram-event-preview${compact ? " instagram-event-preview-compact" : ""}`}>
      <EmbeddedPreview post={event} />
      {!compact && <span className="instagram-open-label">Instagram <ArrowUpRight size={14} /></span>}
    </div>;
    return compact ? preview : <a href={event.url} target="_blank" rel="noopener noreferrer" aria-label={`View ${event.title} on Instagram`}>{preview}</a>;
  }
  return (
    <div
      className={`event-poster poster-${event.theme} ${compact ? "poster-compact" : ""}`}
      role="img"
      aria-label={`${event.posterTitle.join(" ")} — ${event.source === "ticketmaster" ? "Ticketmaster event" : "sample event poster"}`}
    >
      <span className="poster-topline" aria-hidden="true">
        <BrandLogo decorative />
        {event.source === "ticketmaster" ? "Ticketmaster listing" : "presents"}
      </span>
      <strong className="poster-title" aria-hidden="true">
        {event.posterTitle.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </strong>
      <span className="poster-subtitle" aria-hidden="true">
        {event.posterSubtitle}
      </span>
      <svg
        viewBox="0 0 300 170"
        className="poster-art"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {event.art === "market" && (
          <>
            <path d="M38 55 70 20h154l32 35Z" fill="#fff9df" />
            <path d="M38 55q14 22 28 0 14 22 28 0 14 22 28 0 14 22 28 0 14 22 28 0 14 22 28 0 14 22 28 0 14 22 22 0 M61 64v80h176V64 M49 112h200v17H49Z" />
            <path
              d="M77 109q12-36 25 0 12-28 26 0 M166 106q0-28 16-28t18 28 M180 80q-8-16 4-22"
              fill="#f1d6df"
            />
            <path d="M26 138l-6 14 M267 123l10 10 M246 27l7-13 M23 75h12" />
          </>
        )}
        {event.art === "art" && (
          <>
            <path d="M49 27 152 12l18 119-102 15Z" fill="#edb6c8" />
            <path d="m63 40 77-12 14 88-76 11Z" fill="#fff9df" />
            <path d="m78 113 19-44 31 25 11-22 12 38" fill="#9ebb91" />
            <circle cx="105" cy="51" r="9" fill="#edb6c8" />
            <path d="m181 43 71 7-9 102-71-6Z" fill="#a6b7da" />
            <path d="M188 74q51-26 35 22t-41 0" strokeWidth="5" />
            <path d="M21 52h14 M28 45v14 M260 24l6 12 M265 145l9 3" />
          </>
        )}
        {event.art === "record" && (
          <>
            <ellipse cx="155" cy="85" rx="84" ry="66" fill="#292829" />
            <ellipse cx="155" cy="85" rx="61" ry="46" stroke="#d9cdeb" />
            <ellipse cx="155" cy="85" rx="45" ry="34" stroke="#d9cdeb" />
            <ellipse cx="155" cy="85" rx="24" ry="18" fill="#f8c7d7" />
            <circle cx="155" cy="85" r="4" fill="#292829" />
            <path d="M52 64V28l27-6v35 M48 66q-17-3-14 7t18-9 M78 58q-15-4-14 6t15-8 M248 113V75l24 10 M244 115q-17-4-14 8t18-10" />
          </>
        )}
        {event.art === "flower" && (
          <>
            <path
              d="M145 119q-17-19-26 1t26 8q22 25 36-3t-32-8"
              fill="#c5d3a6"
            />
            <path d="M147 111v45" />
            <path
              d="M150 76q-35-54-49-29t35 40q-61-7-48 20t49-9q-20 53 8 48t8-47q40 42 48 13t-38-22q54-22 30-37t-31 31q9-57-18-45t6 37Z"
              fill="#fff1af"
            />
            <circle cx="150" cy="89" r="20" fill="#f8c7d7" />
            <path d="M45 53h14 M52 46v14 M255 125h14 M262 118v14 M245 30l6 12" />
          </>
        )}
        {event.art === "cups" && (
          <>
            <path d="m39 70 77-11 9 59q-33 32-76 10Z" fill="#fff1af" />
            <path d="M118 75q38-12 34 13t-29 22 M59 44q-17-14-4-28 M84 39q-12-17 2-24" />
            <path d="m176 65 78 11-10 61q-34 24-75-8Z" fill="#c5d3a6" />
            <path d="M170 81q-36-18-37 5t35 28 M193 41q16-13 6-29 M222 48q15-16 2-25 M40 143q116 23 210 9" />
          </>
        )}
      </svg>
      <span className="poster-bottomline" aria-hidden="true">
        <span>SYDNEY</span>
        <span>{event.source === "ticketmaster" ? "ILLUSTRATION" : "SAMPLE POSTER"}</span>
      </span>
    </div>
  );
}
