import { km } from "../utils/planner.js";
import { planningArea } from "../utils/location.js";
import { venueRoles, venueAtmosphere } from "./preferences.js";

export const recommendationWeights = Object.freeze({
  preference: 26,
  atmosphere: 18,
  proximity: 18,
  budget: 10,
  quality: 6,
  variety: 8,
  timing: 14,
});
export function scoreVenue(v, prefs, intent, weights = recommendationWeights) {
  const matches = v.tags.filter((t) => intent.interests.includes(t));
  const compatibleRole = venueRoles(v).some((r) =>
    intent.requiredRoles.includes(r),
  );
  const preference = intent.interests.length
    ? Math.min(1, matches.length / Math.min(2, intent.interests.length))
    : 0.5;
  const atmosphere = intent.atmosphere.length
    ? venueAtmosphere(v).filter((t) => intent.atmosphere.includes(t)).length /
      intent.atmosphere.length
    : 0.5;
  const area = planningArea(prefs);
  const proximity = Math.max(0, 1 - km(v, area) / area.r);
  const budget = Number(prefs.budget)
    ? Math.max(0, 1 - v.cost / Number(prefs.budget))
    : v.cost === 0
      ? 1
      : 0;
  // Quality means evidence completeness; ratings are only an optional small part.
  const quality =
    (v.source === "curated" ? 0.7 : v.source === "google" ? 0.8 : 0.1) +
    (Number.isFinite(v.rating) ? Math.min(0.2, v.rating / 25) : 0);
  const scoreBreakdown = {
    preference:
      weights.preference * (preference * 0.8 + (compatibleRole ? 0.2 : 0)),
    atmosphere: weights.atmosphere * Math.min(1, atmosphere),
    proximity: weights.proximity * proximity,
    budget: weights.budget * budget,
    quality: weights.quality * quality,
  };
  return {
    ...v,
    scoreBreakdown,
    score: Object.values(scoreBreakdown).reduce((a, b) => a + b, 0),
  };
}
export function explanationFor(v, intent, role, index) {
  if (v.recommendationReason) return v.recommendationReason;
  const detail = v.description || `${v.category} in ${v.area}.`;
  const fit =
    role === "bar" && intent.hiddenBars
      ? index === 0
        ? "A hidden-bar start to your evening."
        : intent.requiredRoles.includes("meal")
          ? "A hidden-bar finish after dinner."
          : "A hidden-bar stop for an intimate evening."
      : role === "meal" && intent.upscaleMeal
        ? "The upscale dinner you asked for."
        : role === "shop"
          ? "A browsing stop that matches your shopping interests."
          : role === "cafe" && intent.interests.includes("Matcha cafés")
            ? "Matches your café and matcha interests; confirm the current menu."
            : role === "culture"
              ? "An art and culture stop that fits your interests."
              : role === "walk"
                ? "Nearby green space for an outdoor pause."
                : role === "bookshop"
                  ? "A nearby bookshop for a relaxed browse."
                  : "Fits the next part of your outing.";
  return `${detail} ${fit}`;
}
