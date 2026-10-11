import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { matchingPicks } from "../data/mellowayPicks.js";
import { Doodle } from "./DoodleBackdrop.jsx";

export default function MellowayPicks({ query = "", showHeading = true }) {
  const picks = matchingPicks(query);
  if (!picks.length) return null;
  return (
    <section className="melloway-picks" aria-label="melloway picks">
      {showHeading && <h2>melloway picks</h2>}
      {picks.map((pick) => (
        <Link
          key={pick.id}
          className="melloway-pick-card"
          to={`/picks/${pick.id}`}
          aria-label={`view ${pick.shortName}`}
        >
          <span className="pick-cup" aria-hidden="true">
            <Doodle kind="matcha" />
          </span>
          <span>
            <strong>{pick.shortName}</strong>
            <small>
              {pick.stops.length} stops · {pick.durationEstimate} · walking
            </small>
          </span>
          <ArrowUpRight size={19} aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}
