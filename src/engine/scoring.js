import { evidenceScore } from './recommendationEvidence.js';
import { km } from "../utils/planner.js";
import { planningArea } from "../utils/location.js";
import { venueRoles, venueAtmosphere } from "./preferences.js";
import { budgetCategory } from "../utils/activityBudget.js";
import { socialFit } from '@melloway/domain';

export const recommendationWeights = Object.freeze({
  preference: 26,
  atmosphere: 18,
  proximity: 18,
  budget: 10,
  quality: 6,
  evidence: 12,
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
  const requestedAtmosphere = [
    ...new Set([
      ...intent.atmosphere,
      ...(venueRoles(v).some((r) => ["meal", "cafe", "dessert"].includes(r))
        ? intent.diningAtmosphere || []
        : []),
    ]),
  ];
  const atmosphere = requestedAtmosphere.length
    ? venueAtmosphere(v).filter((t) => requestedAtmosphere.includes(t)).length /
      requestedAtmosphere.length
    : 0.5;
  const area = planningArea(prefs);
  const proximity = Math.max(0, 1 - km(v, area) / area.r);
  const categoryBudget =
    prefs.activityBudgets?.[budgetCategory(v)] ?? Number(prefs.budget);
  const budget = categoryBudget
    ? Math.max(0, 1 - v.cost / categoryBudget)
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
    evidence: (weights.evidence ?? 12) * evidenceScore(v, prefs.date),
    socialContext: socialFit(v, v.socialContext, { ...intent, atmosphere: requestedAtmosphere }),
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
          : role === "cafe" &&
              intent.interests.includes("Matcha cafés") &&
              v.tags.includes("Matcha cafés")
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
