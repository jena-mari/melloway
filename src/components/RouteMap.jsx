import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Maximize2,
  ArrowUpRight,
  LocateFixed,
  ListOrdered,
  X,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { directions } from "../utils/planner";
import {
  tileUrl,
  tileAttribution,
  tileAttributionUrl,
} from "../utils/mapTiles";

const embedKey = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY;

function StreetMap({
  stops,
  interactive,
  selectedStopId,
  onSelectStop,
  resetView,
}) {
  const view = useRef(null);
  const pins = useRef([]);
  const selection = useRef(selectedStopId);
  const select = useRef(onSelectStop);
  useEffect(() => {
    select.current = onSelectStop;
  }, [onSelectStop]);
  useEffect(() => {
    selection.current = selectedStopId;
    pins.current.forEach(({ marker, ids }) => {
      const selected = ids.includes(selectedStopId);
      marker.getElement()?.classList.toggle("is-selected", selected);
      marker.getElement()?.setAttribute("aria-pressed", String(selected));
    });
  }, [selectedStopId]);
  useEffect(() => {
    view.current?.fit();
  }, [resetView]);
  const container = useRef(null);
  const reduced = useReducedMotion();
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    setStatus("loading");
    const map = L.map(container.current, {
      attributionControl: false,
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      zoomAnimation: !reduced,
      fadeAnimation: !reduced,
      markerZoomAnimation: !reduced,
    });
    const coords = stops.map((stop) => [stop.lat, stop.lng]);
    const bounds = L.latLngBounds(coords);
    function fit() {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, {
        paddingTopLeft: [55, 65],
        paddingBottomRight: [55, 32],
        maxZoom: 16,
        animate: false,
      });
    }
    fit();
    view.current = { fit };
    let loaded = false;
    const tiles = L.tileLayer(tileUrl, {
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
    });
    tiles.on("tileload", () => {
      loaded = true;
      setStatus("ready");
    });
    tiles.on("tileerror", () => {
      if (!loaded) setStatus("error");
    });
    tiles.addTo(map);
    // A connection line shows visit order; it is deliberately not road routing.
    L.polyline(coords, {
      color: "#f39aad",
      weight: 3,
      dashArray: "7 7",
      interactive: false,
    }).addTo(map);
    const markers = L.layerGroup().addTo(map);
    function drawMarkers() {
      // Group nearby labels on screen without moving the geographic points.
      // Groups separate again as the user zooms in; shared coordinates keep all numbers.
      const groups = [];
      stops.forEach((stop, index) => {
        const pixel = map.latLngToLayerPoint([stop.lat, stop.lng]);
        const group = groups.find((g) => {
          const width =
            g.items.length > 1 ? Math.max(68, g.items.length * 17 + 18) : 64;
          return (
            Math.abs(g.pixel.x - pixel.x) < (width + 64) / 2 &&
            Math.abs(g.pixel.y - pixel.y) < 50
          );
        });
        if (group) group.items.push({ stop, index });
        else groups.push({ pixel, items: [{ stop, index }] });
      });
      markers.clearLayers();
      pins.current = [];
      groups.forEach(({ items }) => {
        const { stop } = items[0];
        const width =
          items.length > 1 ? Math.max(68, items.length * 17 + 18) : 64;
        const label = document.createElement("span");
        label.textContent = items
          .map(({ stop, index }) => `${index + 1}. ${stop.name}`)
          .join(" · ");
        const content = document.createElement("span");
        content.className = "pin-content";
        content.style.width = `${width}px`;
        const numbers = document.createElement("b");
        numbers.className = "pin-numbers";
        numbers.textContent = items.map(({ index }) => index + 1).join(" · ");
        content.append(numbers);
        if (items.length === 1) {
          const price = document.createElement("span");
          price.className = "pin-price";
          price.textContent = Number.isFinite(stop.cost)
            ? `~$${stop.cost}`
            : "estimate";
          content.append(price);
        }
        const marker = L.marker([stop.lat, stop.lng], {
          icon: L.divIcon({
            className: "route-pin",
            html: content,
            iconSize: [width, 44],
            iconAnchor: [width / 2, 22],
          }),
          title: label.textContent,
          keyboard: true,
          interactive: true,
          riseOnHover: true,
        })
          .bindTooltip(label, { direction: "top", offset: [0, -22] })
          .addTo(markers);
        const ids = items.map(({ stop }) => stop.id);
        const selected = ids.includes(selection.current);
        marker.getElement()?.classList.toggle("is-selected", selected);
        marker.getElement()?.setAttribute("aria-pressed", String(selected));
        marker
          .getElement()
          ?.setAttribute(
            "aria-label",
            `Show ${label.textContent} in your plan`,
          );
        pins.current.push({ marker, ids });
        marker.on("click", () => {
          select.current?.(items[0].stop.id);
        });
        if (interactive && items.length > 1)
          marker.on("click", () => {
            map.fitBounds(
              L.latLngBounds(items.map(({ stop }) => [stop.lat, stop.lng])),
              {
                padding: [70, 70],
                maxZoom: 19,
                animate: !reduced,
              },
            );
          });
      });
    }
    drawMarkers();
    map.on("zoomend", drawMarkers);
    const loadingTimeout = setTimeout(() => {
      if (!loaded) setStatus("error");
    }, 12000);
    const resize = new ResizeObserver(fit);
    resize.observe(container.current);
    return () => {
      view.current = null;
      pins.current = [];
      clearTimeout(loadingTimeout);
      resize.disconnect();
      map.remove();
    };
  }, [stops, interactive, reduced]);
  return (
    <div
      className={`street-map ${interactive ? "interactive-map" : "map-preview"}`}
    >
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Map of your stops"
      />
      {status !== "ready" && (
        <p className="map-status" role="status">
          {status === "error"
            ? "street map couldn’t load. ur stops are still below."
            : "bringing ur day into view…"}
        </p>
      )}
      <a
        className="map-attribution"
        href={tileAttributionUrl}
        target="_blank"
        rel="noreferrer"
      >
        {tileAttribution}
      </a>
    </div>
  );
}

function MapCanvas({ stops, transport, interactive, ...selection }) {
  // Google Places content belongs on a Google map, never third-party tiles.
  if (stops.some((stop) => stop.source === "google")) {
    if (!embedKey || stops.length === 1)
      return (
        <div className="map-unavailable">
          <span className="map-unavailable-dots" aria-hidden="true">
            {stops.map((_, i) => i + 1).join(" · · · ")}
          </span>
          <p>ur route is ready in Google Maps.</p>
          <a
            href={directions(stops, transport)}
            target="_blank"
            rel="noreferrer"
          >
            see the route <ArrowUpRight size={16} />
          </a>
        </div>
      );
    const url = new URL("https://www.google.com/maps/embed/v1/directions");
    url.searchParams.set("key", embedKey);
    url.searchParams.set("origin", `${stops[0].lat},${stops[0].lng}`);
    url.searchParams.set(
      "destination",
      `${stops.at(-1).lat},${stops.at(-1).lng}`,
    );
    url.searchParams.set(
      "waypoints",
      stops
        .slice(1, -1)
        .map((s) => `${s.lat},${s.lng}`)
        .join("|"),
    );
    url.searchParams.set(
      "mode",
      transport === "Walking"
        ? "walking"
        : transport === "Driving"
          ? "driving"
          : "transit",
    );
    return (
      <iframe
        className="google-route-map"
        title="Google Maps route for your day"
        src={url.href}
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    );
  }
  return <StreetMap stops={stops} interactive={interactive} {...selection} />;
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
          {!google && !compact && (
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
