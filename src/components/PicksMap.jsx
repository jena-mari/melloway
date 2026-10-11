import { useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import GoogleMapCanvas from "./GoogleMapCanvas.jsx";
import { tileUrl, tileAttribution, tileAttributionUrl } from "../utils/mapTiles.js";

function markerContent(element, [point]) {
  element.textContent = String(point.number);
}

// Reuse the app's street tiles when the optional Google SDK is unavailable.
// Editorial pins are independent places; there is no invented route between them.
function StreetPicksMap({ points, selectedId, focusPoint, onSelect, resetView }) {
  const canvas = useRef(null), view = useRef(null), select = useRef(onSelect);
  const reduced = useReducedMotion();
  select.current = onSelect;
  useEffect(() => {
    const map = L.map(canvas.current, { scrollWheelZoom: false, attributionControl: false });
    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    const pins = points.map((point) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editorial-pick-pin";
      button.textContent = String(point.number);
      button.setAttribute("aria-label", point.ariaLabel);
      button.addEventListener("click", (event) => { event.stopPropagation(); select.current?.(point.id); });
      const pin = L.marker([point.lat, point.lng], {
        icon: L.divIcon({ className: "editorial-leaflet-pin", html: button, iconSize: [36, 36], iconAnchor: [18, 18] }),
        keyboard: false,
      }).addTo(map);
      return { point, button, pin };
    });
    const fit = () => map.fitBounds(bounds, { padding: [42, 42], maxZoom: 15, animate: false });
    fit();
    view.current = { map, pins, fit };
    const resize = new ResizeObserver(() => { map.invalidateSize({ animate: false }); });
    resize.observe(canvas.current);
    return () => { resize.disconnect(); map.remove(); view.current = null; };
  }, [points]);
  useEffect(() => {
    view.current?.pins.forEach(({ point, button, pin }) => {
      const active = point.id === selectedId;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
      pin.setZIndexOffset(active ? 1000 : 0);
    });
  }, [points, selectedId]);
  useEffect(() => {
    if (focusPoint) view.current?.map.setView([focusPoint.lat, focusPoint.lng], 16, { animate: !reduced });
  }, [focusPoint, points, reduced]);
  useEffect(() => { if (!focusPoint) view.current?.fit(); }, [resetView, points, focusPoint]);
  return <div className="picks-street-map" aria-label="OpenStreetMap picks map">
    <div ref={canvas} className="picks-street-surface" />
    <a className="picks-map-attribution" href={tileAttributionUrl} target="_blank" rel="noreferrer">{tileAttribution}</a>
  </div>;
}

export default function PicksMap({ venues, selectedId, focusPoint, onSelect, onShowAll, resetView }) {
  const points = useMemo(() => venues.map((venue) => ({
    ...venue, className: "editorial-pick-pin", ariaLabel: `select ${venue.name} on map`,
  })), [venues]);
  return <section className="picks-map" aria-label="Map of Melloway’s Picks" data-selected-place={selectedId}>
    <GoogleMapCanvas points={points} selectedId={selectedId} focusPoint={focusPoint}
      onSelect={onSelect} resetView={resetView} markerContent={markerContent}
      className="picks-map-canvas" ariaLabel="Interactive picks map"
      fallback={<StreetPicksMap points={points} selectedId={selectedId} focusPoint={focusPoint} onSelect={onSelect} resetView={resetView} />} />
    <button className="picks-show-all" type="button" onClick={onShowAll} aria-label="show all pick pins">
      <Maximize2 size={15} /> all {venues.length} pins
    </button>
  </section>;
}
