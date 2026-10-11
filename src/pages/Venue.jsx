import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { venues } from "../data/venues";
import { sydneyVenues } from "../data/sydneyVenues";
import { useApp } from "../hooks/useApp";
import { MoodImage } from "../components/UI";
export default function Venue({ route, backTo = "/itinerary" }) {
  const { id } = useParams(),
    { current } = useApp();
  const v =
    (route || current)?.plan?.stops.find((s) => s.id === id) ||
    [...sydneyVenues, ...venues].find((s) => s.id === id);
  if (!v)
    return (
      <div className="page">
        <h1>that spot has wandered off.</h1>
        <Link to="/">start again</Link>
      </div>
    );
  return (
    <div className="page venue">
      <Link className="back" to={backTo} state={route ? { route } : undefined}>
        <ArrowLeft size={17} /> back to ur day
      </Link>
      <div className="venue-layout">
        <div className="venue-photo">
          <MoodImage
            src={v.image}
            alt={v.source === "demo" ? "Illustrative mood photograph" : ""}
          />
          <span className="pill-label">
            {v.source === "demo"
              ? "demo venue · mood imagery"
              : v.source === "curated"
                ? "sourced Sydney venue"
                : `Google Places${v.attribution ? " · " + v.attribution : ""}`}
          </span>
        </div>
        <div>
          <h1>{v.name}</h1>
          <p>{v.address}</p>
          <div className="chips">
            {v.tags.map((t) => (
              <span className="chip selected" key={t}>
                {t}
              </span>
            ))}
          </div>
          {v.reason && <p>{v.reason}</p>}
          <p className="venue-description">{v.note}</p>
          {v.website && (
            <a href={v.website} target="_blank" rel="noreferrer">
              venue source ↗
            </a>
          )}
          <dl>
            <div>
              <dt>estimated spend</dt>
              <dd>~${v.cost} each</dd>
            </div>
            <div>
              <dt>visit</dt>
              <dd>{v.mins} minutes</dd>
            </div>
            <div>
              <dt>rating</dt>
              <dd>{v.rating ? `${v.rating}/5 · Google` : "not available"}</dd>
            </div>
          </dl>
          <a
            className="button green"
            target="_blank"
            rel="noreferrer"
            href={
              v.mapsUri ||
              `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`
            }
          >
            check it on Google Maps <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
    </div>
  );
}
