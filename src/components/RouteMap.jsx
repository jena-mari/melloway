import { useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2,
  ArrowUpRight,
  X,
} from "lucide-react";
import GoogleMapCanvas from "./GoogleMapCanvas";
import GoogleStopMap from "./GoogleStopMap";
import MapSpotPreview from "./MapSpotPreview";

import { requestItineraryRoutes } from "../services/itineraryRoutes.ts";
import { directions } from "../utils/planner";
import { quietMapStyles } from "../../shared/mapStyles.ts";
function routeMarker(element, group) {
  const numbers = document.createElement("b");
  numbers.className = "pin-numbers";
  group.forEach((point, index) => {
    const letter = document.createElement("span");
    letter.textContent = String.fromCharCode(65 + point.index);
    numbers.append(letter);
    if (index < group.length - 1) {
      const separator = document.createElement("span");
      separator.hidden = true;
      separator.textContent = " · ";
      numbers.append(separator);
    }
  });
  if (group.length > 1) {
    const columns = Math.ceil(Math.sqrt(group.length));
    element.style.setProperty("--map-pin-size", `${columns * 18 + 8}px`);
    numbers.style.setProperty("--pin-columns", columns);
    numbers.style.fontSize = "11px";
  }
  element.append(numbers);
}

function MapCanvas({ stops, transport, interactive, selectedStopId, onSelectStop, routePaths, transportMode }) {
  const points = useMemo(() => stops.map((stop, index) => ({
    ...stop, index, className: "route-pin editorial-pick-pin",
    ariaLabel: `Show ${String.fromCharCode(65 + index)}. ${stop.name} in your plan`,
  })), [stops]);
  if (stops.some((stop) => stop.source === "google"))
    return <GoogleStopMap stops={stops} selectedStopId={selectedStopId}
      onSelectStop={onSelectStop} directionsUrl={directions(stops, transport)} routePaths={routePaths} transport={transportMode} />;
  return (
    <div className={`street-map ${interactive ? "interactive-map" : "map-preview"}`}>
      <GoogleMapCanvas routePaths={routePaths} routeTransport={transportMode} points={points} selectedId={selectedStopId}
        onSelect={onSelectStop} interactive={interactive}
        groupNearby mapStyles={quietMapStyles} routeColorVar="--pink" markerContent={routeMarker} ariaLabel="Map of your stops"
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
  stops,
  transport = "Not selected",
  date,
  time,
  selectedStopId,
  onSelectStop,
}) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const titleId = id === "route-map" ? "expanded-map-title" : `${id}-title`;
  function selectStop(id) {
    dialog.current?.close();
    onSelectStop?.(id);
  }
  const [routes, setRoutes] = useState(null);
  const [routeStatus, setRouteStatus] = useState("loading");
  const realStops = stops.every(stop => ["google", "curated"].includes(stop.source));
  const transportMode = ['Walking', 'Public transport', 'Driving'].includes(transport) ? transport : null;
  useEffect(() => {
    if (!realStops || stops.length < 2 || !transportMode) { setRoutes(null); setRouteStatus("order"); return; }
    const controller = new AbortController();
    setRoutes(null);
    setRouteStatus("loading");
    requestItineraryRoutes(stops, transportMode, date, time,
      AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      .then(data => { if (!controller.signal.aborted) { setRoutes(data); setRouteStatus("ready"); } })
      .catch(() => { if (!controller.signal.aborted) setRouteStatus("error"); });
    return () => controller.abort();
  }, [stops, realStops, transportMode, date, time]);
  const routePaths = realStops ? routes?.paths || [] : undefined;
  const google = stops.some((stop) => stop.source === "google");
  const caption = realStops && stops.length > 1
    ? !transportMode ? 'Choose transport for directions · times use planning buffers.' : routeStatus === "loading" ? `Loading ${transportMode.toLowerCase()} route…`
      : routeStatus === "error" || routes?.missingLegs
        ? "Some route connections are unavailable. Open Google Maps for directions."
        : `${transportMode} route · confirm directions before heading out.`
    : google ? "Confirm directions and opening times before heading out."
      : "Sample stops · dotted line shows visit order, not a road route.";
  const routeWarnings = routes?.warnings.join(" ") || "";
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
          routePaths={routePaths}
          transportMode={transportMode}
          interactive={false}
          selectedStopId={selectedStopId}
          onSelectStop={selectStop}
        />
        <div className="map-toolbar">
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
      </div>
      <p className="map-caption">{caption} {routeWarnings}</p>
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
              routePaths={routePaths}
              transportMode={transportMode}
              interactive
              selectedStopId={selectedStopId}
              onSelectStop={selectStop}
            />
            <div className="expanded-route-footer">
              <p>{caption} {routeWarnings}</p>
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
