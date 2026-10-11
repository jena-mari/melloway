import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { LocateFixed } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { areas } from "../data/preferences";
import {
  tileUrl,
  tileAttribution,
  tileAttributionUrl,
} from "../utils/mapTiles";

// These pins use our local area coordinates, not provider search results.
// Inner West and Newtown share a centre; show one pin at that point.
const pinNames = ["Sydney CBD", "Surry Hills", "Newtown", "Eastern Suburbs"];
export default function LocationMap({ selectedArea, onSelect }) {
  const container = useRef(null);
  const view = useRef(null);
  const select = useRef(onSelect);
  const reduced = useReducedMotion();
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    const map = L.map(container.current, {
      attributionControl: false,
      scrollWheelZoom: false,
      zoomControl: false,
      zoomAnimation: !reduced,
      fadeAnimation: !reduced,
      markerZoomAnimation: !reduced,
      minZoom: 9,
      maxZoom: 17,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const bounds = L.latLngBounds(
      pinNames.map((name) => [areas[name].lat, areas[name].lng]),
    );
    const fit = () => {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 13, animate: false });
    };
    fit();
    let loaded = false;
    setStatus("loading");
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
    const pins = pinNames.map((name, index) => {
      const content = document.createElement("span");
      const dot = document.createElement("span");
      dot.className = "location-area-dot";
      const label = document.createElement("span");
      label.className = "location-area-name";
      label.textContent = name;
      content.append(dot, label);
      const marker = L.marker([areas[name].lat, areas[name].lng], {
        icon: L.divIcon({
          className: `location-area-pin location-area-pin-${index}`,
          html: content,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
        keyboard: true,
        title: name,
        riseOnHover: true,
      }).addTo(map);
      const element = marker.getElement();
      element.setAttribute("aria-label", `Choose ${name}`);
      element.setAttribute("aria-pressed", "false");
      // Handle both keys explicitly so selection never submits the intro form.
      element.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          select.current(name);
        }
      });
      marker.on("click", () => select.current(name));
      return { name, marker };
    });
    view.current = { map, pins, fit };
    const timeout = setTimeout(() => {
      if (!loaded) setStatus("error");
    }, 12000);
    const resize = new ResizeObserver(fit);
    resize.observe(container.current);
    return () => {
      clearTimeout(timeout);
      resize.disconnect();
      view.current = null;
      map.remove();
    };
  }, [reduced]);
  useEffect(() => {
    const current = view.current;
    if (!current) return;
    current.pins.forEach(({ name, marker }) => {
      const selected = name === selectedArea;
      marker.getElement()?.classList.toggle("is-selected", selected);
      marker.getElement()?.setAttribute("aria-pressed", String(selected));
    });
    const area = areas[selectedArea];
    if (area && selectedArea !== "Anywhere in Sydney") {
      if (!current.map.getBounds().pad(-0.1).contains([area.lat, area.lng]))
        current.map.panTo([area.lat, area.lng], { animate: false });
    } else current.fit();
  }, [selectedArea, reduced]);
  return (
    <div className="location-map">
      <div
        ref={container}
        className="location-map-canvas"
        role="region"
        aria-label="Choose an area on the Sydney map"
      />
      <button
        type="button"
        className="location-map-fit"
        aria-label="show all Sydney areas"
        onClick={() => view.current?.fit()}
      >
        <LocateFixed size={18} />
      </button>
      {status !== "ready" && (
        <p className="location-map-status" role="status">
          {status === "error"
            ? "map unavailable · you can still choose an area"
            : "loading map…"}
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
