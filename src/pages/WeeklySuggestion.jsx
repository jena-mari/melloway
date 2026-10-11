import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, ArrowRight } from "lucide-react";
import { findWeeklySuggestion, weeklyPlanPatch } from "../data/weeklySuggestions.js";
import { useApp } from "../hooks/useApp";
import { Doodle } from "../components/DoodleBackdrop";

export default function WeeklySuggestion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { draft, update } = useApp();
  const item = findWeeklySuggestion(id);
  if (!item) return <div className="page"><h1>suggestion not found</h1><Link to="/community">back to explore</Link></div>;
  return (
    <div className="page weekly-detail">
      <Link className="back" to="/community"><ArrowLeft size={17} /> explore</Link>
      <div className="weekly-detail-art" aria-hidden="true"><Doodle kind={item.doodle} /></div>
      <p className="weekly-detail-kicker">Weekly Suggestions · {item.activity}</p>
      <h1>{item.name}</h1>
      <p className="weekly-detail-address">{item.address}</p>
      <p>{item.description}</p>
      <dl>
        <div><dt>when</dt><dd>{item.visit}</dd></div>
        <div><dt>cost</dt><dd>{item.price}</dd></div>
      </dl>
      <div className="weekly-detail-links">
        <a href={item.website} target="_blank" rel="noopener noreferrer">venue details <ArrowUpRight size={16} /></a>
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name}, ${item.address}`)}`} target="_blank" rel="noopener noreferrer">directions <ArrowUpRight size={16} /></a>
      </div>
      <button className="button" onClick={() => {
        update(weeklyPlanPatch(item, draft));
        navigate(draft.name.trim() ? "/plan/vibes" : "/plan/profile");
      }}>plan around this <ArrowRight size={17} /></button>
      <p className="weekly-detail-source">Venue details checked {item.checkedAt}. Confirm sessions and availability before going.</p>
    </div>
  );
}
