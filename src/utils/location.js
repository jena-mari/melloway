import { areas } from "../data/preferences.js";

export const sydneyBounds = {
  south: -34.3,
  north: -33.3,
  west: 150.5,
  east: 151.6,
};
export function inSydney({ lat, lng } = {}) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= sydneyBounds.south &&
    lat <= sydneyBounds.north &&
    lng >= sydneyBounds.west &&
    lng <= sydneyBounds.east
  );
}
export function validLocation(location) {
  return Boolean(
    location &&
    inSydney(location) &&
    typeof location.name === "string" &&
    location.name.length > 0 &&
    location.name.length <= 200 &&
    typeof location.address === "string" &&
    location.address.length <= 500 &&
    typeof location.id === "string" &&
    location.id.length > 0 &&
    location.id.length <= 200 &&
    location.r >= 1 &&
    location.r <= 10 &&
    Number.isFinite(location.r) &&
    location.source === "google",
  );
}
export function planningArea(prefs) {
  return validLocation(prefs.location) ? prefs.location : areas[prefs.area];
}
export function localLocations(query = "") {
  const text = query.trim().toLowerCase();
  return Object.keys(areas)
    .filter((name) => !text || `${name} sydney`.toLowerCase().includes(text))
    .slice(0, 6)
    .map((name) => ({
      id: name,
      name,
      address: "Sydney, NSW · local area",
      source: "local",
    }));
}
