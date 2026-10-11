import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Clock3, MapPin, X } from "lucide-react";
import { editorialPicks } from "../data/editorialPicks.js";
import { Doodle } from "./DoodleBackdrop.jsx";
import { MoodImage } from "./UI.jsx";
import PicksMap from "./PicksMap.jsx";
import Venue from "../pages/Venue.jsx";
import MellowayPicks from "./MellowayPicks.jsx";
import WeeklySuggestions from "./WeeklySuggestions.jsx";
import VenueSocial from "./VenueSocial.jsx";

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

function PickDetails({ venue, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} className="stop-picker-dialog spot-detail-dialog pick-detail-dialog"
    aria-labelledby="pick-detail-title"
    onClose={(event) => { if (event.target === dialog.current) onClose(); }}
    onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
    <div className="stop-picker-content">
      <header>
        <div><p>Melloway’s pick · {venue.category.toLowerCase()}</p><h2 id="pick-detail-title">{venue.name}</h2></div>
        <button type="button" autoFocus aria-label="close pick details" onClick={() => dialog.current.close()}><X size={22} /></button>
      </header>
      <div className="spot-detail-photo"><PlacePhoto venue={venue} /></div>
      <div className="stop-detail">
        <div className="stop-kicker"><span>~{venue.mins} min visit</span><span>{venue.costLabel}</span></div>
        <p className="stop-address"><MapPin size={14} /> {venue.address}</p>
        <div className="editorial-vibes">{venue.vibes.map((vibe) => <span key={vibe}>{vibe}</span>)}</div>
        <p>{venue.description}</p><p>{venue.scheduleLabel}</p>
        <VenueSocial venue={venue} compact />
        <PickEvidence venue={venue} />
        <a className="button green" target="_blank" rel="noreferrer"
          href={venue.mapsUri || `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`}>
          check it on Google Maps <ArrowUpRight size={17} />
        </a>
      </div>
    </div>
  </dialog>;
}

export default function PicksExplorer({ embedded = false }) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const venues = useMemo(() => editorialPicks
    .map((venue, index) => ({ ...venue, number: index + 1 })), []);
  const [selectedId, setSelectedId] = useState(() => params.get("place") || venues[0].id);
  const [focused, setFocused] = useState(false), [resetView, setResetView] = useState(0);
  const cards = useRef(new Map()), carousel = useRef(null), scrollTimer = useRef(null), drag = useRef(null), skipClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [detail, setDetail] = useState(null);
  const reduced = useReducedMotion();
  const active = venues.find((venue) => venue.id === selectedId) || venues[0];
  const activeIndex = venues.indexOf(active);
  useEffect(() => { if (!venues.some((venue) => venue.id === selectedId)) setSelectedId(venues[0].id); }, [venues, selectedId]);
  useEffect(() => {
    const requested = params.get("place");
    if (id || !venues.some((venue) => venue.id === requested)) return;
    const frame = requestAnimationFrame(() => select(requested));
    return () => cancelAnimationFrame(frame);
  }, [id]);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  function select(id, scroll = true) {
    setSelectedId(id); setFocused(true);
    const next = new URLSearchParams(params);
    next.set("place", id);
    setParams(next, { replace: true });
    const card = cards.current.get(id), list = carousel.current;
    if (embedded || !scroll || !card || !list) return;
    const cardBox = card.getBoundingClientRect(), listBox = list.getBoundingClientRect();
    list.scrollTo({
      left: embedded ? 0 : list.scrollLeft + cardBox.left - listBox.left - (list.clientWidth - cardBox.width) / 2,
      top: embedded ? list.scrollTop + cardBox.top - listBox.top - (list.clientHeight - cardBox.height) / 2 : 0,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  function view(venue) {
    select(venue.id, false);
    setDetail(venue);
  }
  function followSwipe() {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const list = carousel.current;
      if (!list) return;
      const box = list.getBoundingClientRect(), center = embedded ? box.top + box.height / 2 : box.left + box.width / 2;
      const closest = venues.reduce((best, venue) => {
        const card = cards.current.get(venue.id)?.getBoundingClientRect();
        const distance = card ? Math.abs((embedded ? card.top + card.height / 2 : card.left + card.width / 2) - center) : Infinity;
        return distance < best.distance ? { id: venue.id, distance } : best;
      }, { id: active.id, distance: Infinity });
      if (closest.id !== active.id) select(closest.id, false);
    }, 120);
  }
  function startDrag(event) {
    skipClick.current = false;
    drag.current = null;
    if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("a, button")) return;
    drag.current = { position: embedded ? event.clientY : event.clientX, scroll: embedded ? carousel.current.scrollTop : carousel.current.scrollLeft, moved: false };
  }
  function moveDrag(event) {
    const gesture = drag.current;
    if (!gesture || event.pointerType !== "mouse" || !event.buttons) return;
    const position = embedded ? event.clientY : event.clientX;
    if (Math.abs(position - gesture.position) < 6 && !gesture.moved) return;
    gesture.moved = true;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (embedded) event.currentTarget.scrollTop = gesture.scroll + gesture.position - position;
    else event.currentTarget.scrollLeft = gesture.scroll + gesture.position - position;
  }
  function endDrag(event) {
    if (!drag.current?.moved) { drag.current = null; return; }
    setDragging(false);
    const list = carousel.current;
    const box = list.children[0].getBoundingClientRect();
    const step = (embedded ? box.height : box.width) + 12;
    const index = Math.max(0, Math.min(venues.length - 1, Math.round((embedded ? list.scrollTop : list.scrollLeft) / step)));
    select(venues[index].id);
    skipClick.current = event.type !== "pointercancel";
    drag.current = null;
  }
  function carouselKey(event) {
    const previous = embedded ? "ArrowUp" : "ArrowLeft", next = embedded ? "ArrowDown" : "ArrowRight";
    if (event.target !== event.currentTarget || ![previous, next].includes(event.key)) return;
    event.preventDefault();
    select(venues[Math.max(0, Math.min(venues.length - 1, activeIndex + (event.key === next ? 1 : -1)))].id);
  }
  if (id) {
    const venue = editorialPicks.find((venue) => venue.id === id);
    if (!venue) return <div className="page"><h1>that pick has wandered off.</h1><Link to="/picks">back to all picks</Link></div>;
    return <div className="editorial-pick-detail">
      <Venue route={{ plan: { stops: [venue] } }} backTo={`/picks?place=${venue.id}`} backLabel="back to all picks"
        photoCredit={venue.photo ? <PhotoCredit photo={venue.photo} /> : undefined}
        extraDetails={<PickEvidence venue={venue} />} />
    </div>;
  }
  return <><div className={`picks-explorer ${embedded ? "embedded-picks" : ""}`}>
    <header className="editorial-picks-header">
      {embedded ? <h2>Melloway’s Picks</h2> : <>
        <Link className="back" to="/explore"><ArrowLeft size={16} /> explore</Link>
        <h1>Melloway’s Picks</h1>
      </>}
    </header>
    <div className="editorial-picks-browser">
      <PicksMap venues={venues} selectedId={active.id} focusPoint={focused ? active : null}
        onSelect={embedded ? (id) => view(venues.find((venue) => venue.id === id)) : select}
        resetView={resetView} onShowAll={() => { setFocused(false); setResetView((old) => old + 1); }} />
      <section className="editorial-card-panel" aria-label="Pick photo cards">
        <ul className={`editorial-place-cards ${dragging ? "is-dragging" : ""}`} ref={carousel}
          aria-label={embedded ? "Melloway’s Picks" : "Swipe through Melloway’s Picks"}
          {...(!embedded && { onScroll: followSwipe, tabIndex: 0, onKeyDown: carouselKey,
            onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag,
            onDragStart: (event) => event.preventDefault(),
            onClickCapture: (event) => { if (skipClick.current) { event.preventDefault(); event.stopPropagation(); skipClick.current = false; } },
          })}>
          {venues.map((venue) => <li key={venue.id} ref={(element) => { if (element) cards.current.set(venue.id, element); else cards.current.delete(venue.id); }}
            className={`editorial-place-card ${active.id === venue.id ? "is-selected" : ""}`} data-venue-id={venue.id}
            onClick={embedded ? (event) => { if (!event.target.closest("a, button")) view(venue); } : undefined}>
            <PlacePhoto venue={venue} />
            <div className="editorial-place-copy">
              {!embedded && <div className="editorial-place-kicker"><span>{venue.kind === "recurring-event" ? "weekly event" : venue.category}</span><span>{String(venue.number).padStart(2, "0")}</span></div>}
              <h2><button type="button" aria-label={embedded ? `view ${venue.name} details` : `show ${venue.name} on map`}
                aria-haspopup={embedded ? "dialog" : undefined} onClick={() => embedded ? view(venue) : select(venue.id)}>{venue.name}</button></h2>
              <p className="editorial-place-address"><MapPin size={14} /> {venue.address}</p>
              {!embedded && <>
                <div className="editorial-vibes">{venue.vibes.map((vibe) => <span key={vibe}>{vibe}</span>)}</div>
                <p>{venue.description}</p>
                <div className="editorial-place-facts"><span><Clock3 size={14} /> ~{venue.mins} min visit</span><span>{venue.costLabel}</span></div>
                <p className="editorial-place-schedule">{venue.scheduleLabel}</p>
              </>}
              {embedded
                ? <button type="button" className="text-button" aria-haspopup="dialog" onClick={() => view(venue)}>the details <ArrowUpRight size={15} /></button>
                : <Link className="text-button" to={`/picks/places/${venue.id}`}>the details <ArrowUpRight size={15} /></Link>}
            </div>
          </li>)}
        </ul>
        {!embedded && <div className="picks-carousel-progress">
          <p>swipe to explore</p>
        </div>}
      </section>
    </div>
  </div>
    {detail && <PickDetails key={detail.id} venue={detail} onClose={() => setDetail(null)} />}
    {!embedded && <section className="editorial-existing-picks" aria-label="Existing pick routes">
      <h2>make a day of it.</h2><MellowayPicks showHeading={false} /><WeeklySuggestions />
    </section>}
  </>;
}
