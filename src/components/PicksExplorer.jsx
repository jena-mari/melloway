import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3, MapPin } from "lucide-react";
import { editorialPicks, pickCollections } from "../data/editorialPicks.js";
import { Doodle } from "./DoodleBackdrop.jsx";
import { MoodImage } from "./UI.jsx";
import PicksMap from "./PicksMap.jsx";
import Venue from "../pages/Venue.jsx";
import MellowayPicks from "./MellowayPicks.jsx";
import WeeklySuggestions from "./WeeklySuggestions.jsx";

function PhotoCredit({ photo }) {
  return <span className="editorial-photo-credit">
    <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.author}</a>
    {" · "}<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>
    <span>{photo.caption}</span>
  </span>;
}

function PlacePhoto({ venue }) {
  return <div className={`editorial-place-photo ${venue.image ? "has-photo" : ""}`}>
    <div className="editorial-photo-placeholder">
      <Doodle kind={venue.artwork} />
      <span>no venue photo yet.</span>
      <small>{venue.category}</small>
    </div>
    {venue.image && <MoodImage src={venue.image} alt={venue.photo.caption} />}
    {venue.photo && <PhotoCredit photo={venue.photo} />}
  </div>;
}

function PickEvidence({ venue }) {
  return <section className="editorial-evidence" aria-label="Pick sources and access">
    <h2>a little before you go</h2>
    <p>{venue.conditions}</p>
    <p className="editorial-estimate">Visit length and spending allowances are estimates. Source snapshot: 11 October 2026.</p>
    <div className="editorial-source-links">
      {venue.sources.map((source, index) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
        {index === 0 ? "venue source" : source.fields.includes("membership terms") ? "membership terms" : "additional source"} <ArrowUpRight size={14} />
      </a>)}
      <a href={venue.coordinateSource} target="_blank" rel="noreferrer">map source <ArrowUpRight size={14} /></a>
    </div>
    {venue.photo && <PhotoCredit photo={venue.photo} />}
  </section>;
}

export default function PicksExplorer() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const collection = pickCollections.some((item) => item.id === params.get("collection")) ? params.get("collection") : "all";
  const venues = useMemo(() => editorialPicks
    .map((venue, index) => ({ ...venue, number: index + 1 }))
    .filter((venue) => collection === "all" || venue.collections.includes(collection)), [collection]);
  const [selectedId, setSelectedId] = useState(() => params.get("place") || venues[0].id);
  const [focused, setFocused] = useState(false), [resetView, setResetView] = useState(0);
  const cards = useRef(new Map()), carousel = useRef(null), scrollTimer = useRef(null);
  const reduced = useReducedMotion();
  const active = venues.find((venue) => venue.id === selectedId) || venues[0];
  const activeIndex = venues.indexOf(active);
  useEffect(() => { if (!venues.some((venue) => venue.id === selectedId)) setSelectedId(venues[0].id); }, [venues, selectedId]);
  useEffect(() => {
    const requested = params.get("place");
    if (id || !venues.some((venue) => venue.id === requested)) return;
    const frame = requestAnimationFrame(() => select(requested));
    return () => cancelAnimationFrame(frame);
  }, [id, collection]);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  function select(id, scroll = true) {
    setSelectedId(id); setFocused(true);
    setParams((old) => { const next = new URLSearchParams(old); next.set("place", id); return next; }, { replace: true });
    const card = cards.current.get(id), list = carousel.current;
    if (!scroll || !card || !list) return;
    const cardBox = card.getBoundingClientRect(), listBox = list.getBoundingClientRect();
    list.scrollTo({
      left: list.scrollLeft + cardBox.left - listBox.left - (list.clientWidth - cardBox.width) / 2,
      top: 0,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  function followSwipe() {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const list = carousel.current;
      if (!list) return;
      const box = list.getBoundingClientRect(), center = box.left + box.width / 2;
      const closest = venues.reduce((best, venue) => {
        const card = cards.current.get(venue.id)?.getBoundingClientRect();
        const distance = card ? Math.abs(card.left + card.width / 2 - center) : Infinity;
        return distance < best.distance ? { id: venue.id, distance } : best;
      }, { id: active.id, distance: Infinity });
      if (closest.id !== active.id) select(closest.id, false);
    }, 120);
  }
  if (id) {
    const venue = editorialPicks.find((venue) => venue.id === id);
    if (!venue) return <div className="page"><h1>that pick has wandered off.</h1><Link to="/picks">back to all picks</Link></div>;
    return <div className="editorial-pick-detail">
      <Venue route={{ plan: { stops: [venue] } }} backTo={`/picks?collection=${collection}&place=${venue.id}`} backLabel="back to all picks"
        photoCredit={venue.photo ? <PhotoCredit photo={venue.photo} /> : undefined}
        extraDetails={<PickEvidence venue={venue} />} />
    </div>;
  }
  return <div className="picks-explorer">
    <header className="editorial-picks-header">
      <Link className="back" to="/community"><ArrowLeft size={16} /> explore</Link>
      <div><h1>Melloway’s Picks</h1><p>a few places worth making time for.</p></div>
      <div className="editorial-collection-filters" role="group" aria-label="Pick collections">
        {pickCollections.map((filter) => <button key={filter.id} type="button" aria-pressed={collection === filter.id}
          onClick={() => { clearTimeout(scrollTimer.current); setParams(filter.id === "all" ? {} : { collection: filter.id }); setFocused(false); setResetView((old) => old + 1); carousel.current?.scrollTo({ left: 0, top: 0, behavior: "instant" }); }}>
          {filter.label}
        </button>)}
      </div>
    </header>
    <div className="editorial-picks-browser">
      <PicksMap venues={venues} selectedId={active.id} focusPoint={focused ? active : null} onSelect={select}
        resetView={resetView} onShowAll={() => { setFocused(false); setResetView((old) => old + 1); }} />
      <section className="editorial-card-panel" aria-label="Pick photo cards">
        <div className="editorial-carousel-controls">
          <p aria-live="polite">{activeIndex + 1} / {venues.length} · {active.name}</p>
          <div><button type="button" aria-label="previous pick" disabled={activeIndex === 0} onClick={() => select(venues[activeIndex - 1].id)}><ArrowLeft size={18} /></button>
            <button type="button" aria-label="next pick" disabled={activeIndex === venues.length - 1} onClick={() => select(venues[activeIndex + 1].id)}><ArrowRight size={18} /></button></div>
        </div>
        <ul className="editorial-place-cards" ref={carousel} onScroll={followSwipe}>
          {venues.map((venue) => <li key={venue.id} ref={(element) => { if (element) cards.current.set(venue.id, element); else cards.current.delete(venue.id); }}
            className={`editorial-place-card ${active.id === venue.id ? "is-selected" : ""}`} data-venue-id={venue.id}>
            <PlacePhoto venue={venue} />
            <div className="editorial-place-copy">
              <div className="editorial-place-kicker"><span>{venue.kind === "recurring-event" ? "weekly event" : venue.category}</span><span>{String(venue.number).padStart(2, "0")}</span></div>
              <h2><button type="button" aria-label={`show ${venue.name} on map`} onClick={() => select(venue.id)}>{venue.name}</button></h2>
              <p className="editorial-place-address"><MapPin size={14} /> {venue.address}</p>
              <div className="editorial-vibes">{venue.vibes.map((vibe) => <span key={vibe}>{vibe}</span>)}</div>
              <p>{venue.description}</p>
              <div className="editorial-place-facts"><span><Clock3 size={14} /> ~{venue.mins} min visit</span><span>{venue.costLabel}</span></div>
              <p className="editorial-place-schedule">{venue.scheduleLabel}</p>
              <Link className="text-button" to={`/picks/places/${venue.id}?collection=${collection}`}>the details <ArrowUpRight size={15} /></Link>
            </div>
          </li>)}
        </ul>
      </section>
    </div>
    <p className="editorial-browse-note">Editorial picks · estimated visits and allowances · venue/building pins. Check hours, access and event listings before heading out.</p>
    <section className="editorial-existing-picks" aria-label="Existing pick routes">
      <h2>make a day of it.</h2><MellowayPicks showHeading={false} /><WeeklySuggestions />
    </section>
  </div>;
}
