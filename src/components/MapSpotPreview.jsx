import { venuePriceLabel } from "../../packages/domain/src/venuePricing.ts";
import { ArrowUpRight, X } from "lucide-react";
import { Doodle } from "./DoodleBackdrop";
import { MoodImage } from "./UI";

export default function MapSpotPreview({ points, onSelect, onClose }) {
  return <aside className="map-spot-preview" aria-label="Place preview">
    <button type="button" className="map-preview-close" aria-label="close place preview" onClick={onClose}><X size={16} /></button>
    <div className="map-preview-spots">
      {points.map(point => <div className="map-preview-spot" key={point.id}>
        <div className="map-preview-photo" aria-hidden="true">
          {point.image ? <MoodImage src={point.image} alt="" /> : <Doodle kind={point.tags?.includes("Matcha cafés") ? "matcha" : point.tags?.includes("Bookshops") ? "book" : "flower"} />}
        </div>
        <div className="map-preview-copy">
          <strong>{point.name}</strong>
          <small>{[Number.isFinite(point.cost) ? venuePriceLabel(point) : null, ...(point.tags || []).slice(0, 2)].filter(Boolean).join(" · ")}</small>
          <button type="button" onClick={() => onSelect(point.id)}>see the vibe <ArrowUpRight size={14} /></button>
        </div>
      </div>)}
    </div>
  </aside>;
}
