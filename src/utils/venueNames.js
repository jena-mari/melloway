import { venues } from "../data/venues.js";

const renamed = new Map(
  venues.filter((v) => v.legacyName).map((v) => [v.id, v]),
);

// Migrate only known prototype nicknames. Preserve real provider names, custom
// labels, IDs, coordinates, timing and prices in already-saved itineraries.
export function normaliseVenueName(venue) {
  const canonical = renamed.get(venue?.id);
  return canonical &&
    venue?.source === "demo" &&
    canonical.legacyName === venue.name
    ? { ...venue, name: canonical.name }
    : venue;
}

export function normalisePlanNames(plan) {
  return Array.isArray(plan?.stops)
    ? { ...plan, stops: plan.stops.map(normaliseVenueName) }
    : plan;
}

export function normaliseRouteNames(route) {
  return route
    ? {
        ...route,
        plan: normalisePlanNames(route.plan),
        candidates: Array.isArray(route.candidates)
          ? route.candidates.map(normaliseVenueName)
          : [],
      }
    : route;
}
