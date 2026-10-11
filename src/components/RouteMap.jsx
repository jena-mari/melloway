import { useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2,
  ArrowUpRight,
  LocateFixed,
  ListOrdered,
  X,
} from "lucide-react";
import GoogleMapCanvas from "./GoogleMapCanvas";
import GoogleStopMap from "./GoogleStopMap";
import MapSpotPreview from "./MapSpotPreview";

import { directions } from "../utils/planner";
function routeMarker(element, group) {
  const content = document.createElement("span");
  content.className = "pin-content";
  content.style.width = `${Math.max(64, group.length * 17 + 18)}px`;
  const numbers = document.createElement("b");
  numbers.className = "pin-numbers";
  numbers.textContent = group.map((point) => point.index + 1).join(" · ");
  content.append(numbers);
  if (group.length === 1) {
    const price = document.createElement("span");
    price.className = "pin-price";
    price.textContent = Number.isFinite(group[0].cost) ? `~$${group[0].cost}` : "estimate";
    content.append(price);
  }
  element.append(content);
}

function MapCanvas({ stops, transport, interactive, selectedStopId, onSelectStop, resetView }) {
  const points = useMemo(() => stops.map((stop, index) => ({
    ...stop, index, className: "route-pin",
    ariaLabel: `Show ${index + 1}. ${stop.name} in your plan`,
  })), [stops]);
  if (stops.some((stop) => stop.source === "google"))
    return <GoogleStopMap stops={stops} selectedStopId={selectedStopId}
      onSelectStop={onSelectStop} directionsUrl={directions(stops, transport)} />;
  return (
    <div className={`street-map ${interactive ? "interactive-map" : "map-preview"}`}>
      <GoogleMapCanvas points={points} selectedId={selectedStopId}
        onSelect={onSelectStop} resetView={resetView} interactive={interactive}
        groupNearby markerContent={routeMarker} ariaLabel="Map of your stops"
        renderPreview={(points, onSelect, onClose) => <MapSpotPreview points={points} onSelect={onSelect} onClose={onClose} />}
        fallback={<div className="map-unavailable">
          <p role="status">Google Maps unavailable.</p>
          <a href={directions(stops, transport)} target="_blank" rel="noreferrer">
            see the route <ArrowUpRight size={16} />
          </a>
        </div>} />
    </div>
  );

}

export default function RouteMap({
  id = "route-map",
  title = "ur day, mapped out.",
  compact = false,
  stops,
  transport = "Walking",
  selectedStopId,
  onSelectStop,
}) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const [resetView, setResetView] = useState(0);
  const legendId = id === "route-map" ? "map-stop-legend" : `${id}-legend`;
  const titleId = id === "route-map" ? "expanded-map-title" : `${id}-title`;
  function selectStop(id) {
    dialog.current?.close();
    setLegend(false);
    onSelectStop?.(id);
  }
  const google = stops.some((stop) => stop.source === "google");
  const caption = google
    ? "Confirm directions and opening times before heading out."
    : stops.some((stop) => stop.source === "curated")
      ? "Approximate pins · dotted line shows visit order, not a road route."
      : "Sample stops · dotted line shows visit order, not a road route.";
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <div className="route-map" id={id}>
      <div className="route-map-hero">
        <MapCanvas
          stops={stops}
          transport={transport}
          interactive={false}
          selectedStopId={selectedStopId}
          onSelectStop={selectStop}
          resetView={resetView}
        />
        <div className="map-toolbar">
          {!compact && (
            <button
              className="map-legend-toggle"
              aria-expanded={legend}
              aria-controls={legendId}
              onClick={() => setLegend((old) => !old)}
            >
              <ListOrdered size={17} /> stop order
            </button>
          )}
          {!compact && (
            <button
              className="map-fit"
              aria-label="show whole route"
              onClick={() => setResetView((old) => old + 1)}
            >
              <LocateFixed size={19} />
            </button>
          )}
          <button
            className="map-expand"
            aria-label="expand map"
            aria-haspopup="dialog"
            onClick={() => {
              dialog.current.showModal();
              setOpen(true);
            }}
          >
            <Maximize2 size={16} /> expand
          </button>
        </div>
        {legend && (
          <ol className="map-stop-legend" id={legendId}>
            {stops.map((stop, i) => (
              <li key={stop.id}>
                <button onClick={() => selectStop(stop.id)}>
                  <span>{i + 1}</span>
                  {stop.name}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="map-caption">{caption}</p>
      <dialog
        ref={dialog}
        className="route-map-dialog"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
      >
        {open && (
          <div className="expanded-route">
            <header>
              <h2 id={titleId}>{title}</h2>
              <button
                autoFocus
                aria-label="close map"
                onClick={() => dialog.current.close()}
              >
                <X size={22} />
              </button>
            </header>
            <MapCanvas
              stops={stops}
              transport={transport}
              interactive
              selectedStopId={selectedStopId}
              onSelectStop={selectStop}
            />
            <div className="expanded-route-footer">
              <p>{caption}</p>
              <ol>
                {stops.map((stop) => (
                  <li key={stop.id}>{stop.name}</li>
                ))}
              </ol>
              <a
                className="button"
                href={directions(stops, transport)}
                target="_blank"
                rel="noreferrer"
              >
                get directions <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
