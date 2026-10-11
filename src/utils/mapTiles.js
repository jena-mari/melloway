export const tileUrl =
  import.meta.env.VITE_MAP_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const tileAttribution =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION || "© OpenStreetMap contributors";
export const tileAttributionUrl =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION_URL ||
  "https://www.openstreetmap.org/copyright";
