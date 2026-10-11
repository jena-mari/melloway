import { useMemo } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import GoogleMapCanvas from "./GoogleMapCanvas.jsx";

function markerContent(element, [point]) {
  element.textContent = String(point.number);
}

export default function PicksMap({ venues, selectedId, focusPoint, onSelect }) {
  const points = useMemo(() => venues.map((venue) => ({
    ...venue, className: "editorial-pick-pin", ariaLabel: `select ${venue.name} on map`,
  })), [venues]);
  const active = venues.find((venue) => venue.id === selectedId) || venues[0];
  return <section className="picks-map" aria-label="Map of Melloway’s Picks" data-selected-place={selectedId}>
    <GoogleMapCanvas points={points} selectedId={selectedId} focusPoint={focusPoint}
      onSelect={onSelect} markerContent={markerContent}
      className="picks-map-canvas" ariaLabel="Interactive picks map"
      fallback={<div className="picks-map-unavailable" role="status">
        <MapPin size={24} /><p>Google Maps couldn’t load.</p>
        <a href={`https://www.google.com/maps/search/?api=1&query=${active.lat},${active.lng}`} target="_blank" rel="noreferrer">
          open {active.name} in Google Maps <ArrowUpRight size={14} />
        </a>
      </div>} />
  </section>;
}
