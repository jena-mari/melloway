import { Link } from "react-router-dom";
import { MapPin, ArrowUpRight } from "lucide-react";

export default function ExplorePlaces({ places }) {
  if (!places.length) return null;
  return (
    <section className="melloway-picks" aria-label="places">
      <h2>places</h2>
      <ul className="community-place-list" aria-label="Matching Sydney places">
        {places.map(({ venue, href }) => (
          <li key={venue.id}>
            <Link
              className="melloway-pick-card"
              to={href}
              aria-label={`view ${venue.name}`}
            >
              <span><MapPin size={22} aria-hidden="true" /></span>
              <span>
                <strong>{venue.name}</strong>
                <small>{[venue.category, venue.area].filter(Boolean).join(" · ")}</small>
                <small>{venue.address}</small>
              </span>
              <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
