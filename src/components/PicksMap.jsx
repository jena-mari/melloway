import { useMemo } from "react";
import { ArrowUpRight, MapPin, Maximize2 } from "lucide-react";
import GoogleMapCanvas from "./GoogleMapCanvas.jsx";

// Fit the ten places closely while leaving room for the numbered markers.
const fitPadding = { top: 40, bottom: 20, left: 24, right: 24 };

function markerContent(element, [point]) {
  element.textContent = String(point.number);
}

export default function PicksMap({ venues, selectedId, focusPoint, onSelect, onShowAll, resetView }) {
  const points = useMemo(() => venues.map((venue) => ({
    ...venue, className: "editorial-pick-pin", ariaLabel: `select ${venue.name} on map`,
  })), [venues]);
  const active = venues.find((venue) => venue.id === selectedId) || venues[0];
  return <section className="picks-map" aria-label="Map of Melloway’s Picks" data-selected-place={selectedId}>
    <GoogleMapCanvas points={points} selectedId={selectedId} focusPoint={focusPoint} smoothFocus
      onSelect={onSelect} resetView={resetView} fitPadding={fitPadding} markerContent={markerContent}
      className="picks-map-canvas" ariaLabel="Interactive picks map"
      fallback={<div className="picks-map-unavailable" role="status">
        <MapPin size={24} /><p>Google Maps couldn’t load.</p>
        <a href={`https://www.google.com/maps/search/?api=1&query=${active.lat},${active.lng}`} target="_blank" rel="noreferrer">
          open {active.name} in Google Maps <ArrowUpRight size={14} />
        </a>
      </div>} />
    <button className="picks-show-all" type="button" onClick={onShowAll} aria-label="show all pick pins">
      <Maximize2 size={18} aria-hidden="true" />
    </button>
  </section>;
}
