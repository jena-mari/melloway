import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { weeklyEdition, weeklyMatches, weeklyDateLabel } from "../data/weeklySuggestions.js";
import { Doodle } from "./DoodleBackdrop";

export default function WeeklySuggestions({ query = "" }) {
  const { draft } = useApp();
  const edition = weeklyEdition();
  const suggestions = weeklyMatches(edition, draft, query);
  if (!suggestions.length) return null;
  return (
    <section className="weekly-suggestions" aria-label="Weekly Suggestions">
      <header>
        <h2>Weekly Suggestions</h2>
        <small>{weeklyDateLabel(edition)}</small>
      </header>
      <ul>
        {suggestions.map((item) => (
          <li key={item.id}>
            <Link to={`/weekly/${item.id}`} aria-label={`view ${item.name}`}>
              <span className="weekly-doodle" aria-hidden="true"><Doodle kind={item.doodle} /></span>
              <span className="weekly-label">
                <strong>{item.name}</strong>
                <small>{item.activity} · {item.area}</small>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
