import { hasFreeAdmission } from "../../packages/domain/src/venuePricing.ts";
import { useMemo, useState } from "react";
import { LocateFixed, ArrowUpRight } from "lucide-react";
import GoogleMapCanvas from "./GoogleMapCanvas";
import MapSpotPreview from "./MapSpotPreview";

function spotDirections(venue) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${venue.name}, ${venue.address || "Sydney"}`);
  const placeId = venue.placeId || (venue.source === "google" ? venue.id : null);
  if (placeId) url.searchParams.set("query_place_id", placeId);
  return url.href;
}
function spotMarker(element, [point]) {
  element.textContent = hasFreeAdmission(point) ? "free" : point.priceStatus === 'unknown' ||
    (point.source === 'google' && point.priceStatus === 'estimate' && !point.priceLevel)
    ? "check price" : Number.isFinite(point.cost) ? `~$${point.cost}` : "spot";
}
export default function SuggestionMap({ venues, active, onSelect, onView }) {
  const [resetView, setResetView] = useState(0);
  const points = useMemo(() => venues.map((venue) => ({
    ...venue, className: "suggestion-pin",
    ariaLabel: `show suggested spot ${venue.name}`,
  })), [venues]);
  return (
    <div className="suggestion-map" data-active-venue={active.id}
      data-lat={active.lat} data-lng={active.lng}>
      <GoogleMapCanvas points={points} selectedId={active.id} onSelect={onSelect}
        focusPoint={active} resetView={resetView} markerContent={spotMarker}
        previewOnTap
        className="suggestion-map-canvas" statusClassName="suggestion-map-status"
        ariaLabel={`Location of ${active.name}`}
        renderPreview={(points, onSelect, onClose) => <MapSpotPreview points={points} onSelect={id => {
          onSelect(id);
          onView?.(id);
        }} onClose={onClose} />}
        fallback={<div className="suggestion-map-unavailable">
          <p className="suggestion-map-status" role="status">Google Maps unavailable · address below</p>
          <strong>{active.name}</strong><span>{active.address || "Address unavailable"}</span>
          <a href={spotDirections(active)} target="_blank" rel="noreferrer">
            view location <ArrowUpRight size={15} />
          </a>
        </div>} />
      <button type="button" className="suggestion-map-center"
        aria-label={`center map on ${active.name}`} onClick={() => setResetView((old) => old + 1)}>
        <LocateFixed size={18} />
      </button>
      {(active.coordinatesStatus === "approximate" || active.source === "demo") && (
        <span className="suggestion-map-accuracy">
          {active.source === "demo" ? "sample location" : "approximate pin"}
        </span>
      )}
    </div>
  );
}
