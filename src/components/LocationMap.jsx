import { useMemo, useState } from "react";
import { LocateFixed } from "lucide-react";
import { areas } from "../data/preferences";
import GoogleMapCanvas from "./GoogleMapCanvas";

// These remain local area centres; provider-selected venues keep their own coordinates.
const pinNames = ["Sydney CBD", "Surry Hills", "Newtown", "Eastern Suburbs"];
function areaMarker(element, [point]) {
  const dot = document.createElement("span");
  dot.className = "location-area-dot";
  const label = document.createElement("span");
  label.className = "location-area-name";
  label.textContent = point.name;
  element.append(dot, label);
}
export default function LocationMap({ selectedArea, onSelect }) {
  const [resetView, setResetView] = useState(0);
  const points = useMemo(() => pinNames.map((name, index) => ({
    ...areas[name], name, id: name,
    className: `location-area-pin location-area-pin-${index}`,
    ariaLabel: `Choose ${name}`,
  })), []);
  return (
    <div className="location-map">
      <GoogleMapCanvas points={points} selectedId={selectedArea} onSelect={onSelect}
        markerContent={areaMarker} className="location-map-canvas" resetView={resetView}
        ariaLabel="Choose an area on the Sydney map" statusClassName="location-map-status"
        fallback={<div className="location-map-fallback">
          <p className="location-map-status" role="status">Google Maps unavailable · choose an area</p>
          <div>{pinNames.map((name) => <button type="button" key={name}
            aria-label={`Choose ${name}`} aria-pressed={selectedArea === name}
            onClick={() => onSelect(name)}>{name}</button>)}</div>
        </div>} />
      <button type="button" className="location-map-fit" aria-label="show all Sydney areas"
        onClick={() => setResetView((old) => old + 1)}>
        <LocateFixed size={18} />
      </button>
    </div>
  );
}
