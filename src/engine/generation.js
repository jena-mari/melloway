import { schedule, km } from "../utils/planner.js";
import { venueRoles, timeSuitable, coversTag } from "./preferences.js";
import { templatesForIntent } from "./sequencing.js";
import { explanationFor, recommendationWeights } from "./scoring.js";
import { venueRejection, spendAllowance } from "./filtering.js";

const signature = (stops) =>
  stops
    .map((v) => v.id)
    .sort()
    .join("|");
export function optimiseExperience(
  candidates,
  prefs,
  matrix,
  intent,
  { excludeSignature, weights = recommendationWeights } = {},
) {
  let best = null,
    bestScore = -Infinity;
  const maxLegKm = intent.allowTravel
    ? 8
    : prefs.transport === "Walking"
      ? 2.5
      : 4;
  for (const template of templatesForIntent(intent, prefs)) {
    function search(indices) {
      const stops = indices.map((i, stage) => ({
        ...candidates[i],
        activityRole: template[stage],
      }));
      const plan = stops.length
        ? schedule(stops, prefs, matrix, indices)
        : null;
      if (
        stops.length &&
        (!plan ||
          plan.stops.some((v) => !timeSuitable(v, v.arrival)) ||
          plan.stops.some(
            (v) =>
              v.travelFromPrevious?.minutes >
              (intent.allowTravel
                ? 90
                : prefs.transport === "Walking"
                  ? 45
                  : 35),
          ) ||
          stops.some((v, i) => i > 0 && km(v, stops[i - 1]) > maxLegKm))
      )
        return;
      if (indices.length === template.length) {
        if (
          signature(stops) === excludeSignature ||
          intent.requiredTags.some((tag) => !coversTag(stops, tag))
        )
          return;
        const preferenceScore =
          stops.reduce((s, v) => s + v.score, 0) / stops.length;
        const variety = new Set(template).size / template.length;
        const waits =
          plan.elapsed - plan.travel - stops.reduce((s, v) => s + v.mins, 0);
        const repeatedMeal = template.filter((r) => r === "meal").length > 1;
        const score =
          preferenceScore +
          weights.variety * variety +
          weights.timing * (1 - Math.min(1, waits / 60)) -
          plan.travel * 0.35 -
          (repeatedMeal ? 30 : 0) +
          (template.length === 3 ? 8 : 0) +
          (template.join("|") === "bar|meal|bar" ? 8 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = {
            ...plan,
            sequence: template,
            intent,
            recommendationScore: score,
            stops: plan.stops.map((v, i) => ({
              ...v,
              activityRole: template[i],
              reason: explanationFor(v, intent, template[i], i),
            })),
          };
        }
        return;
      }
      for (let i = 0; i < candidates.length; i++) {
        if (
          indices.includes(i) ||
          !venueRoles(candidates[i]).includes(template[indices.length])
        )
          continue;
        search([...indices, i]);
      }
    }
    search([]);
  }
  return best;
}

export function explainNoMatch(all, prefs, intent, candidates) {
  const nearby = all.filter(
    (v) =>
      !["area", "demo", "rejected"].includes(venueRejection(v, prefs, intent)),
  );
  if (!nearby.length)
    return "This area has no sourced venues in the current catalog. Try Sydney CBD or Newtown, or choose a wider area.";
  for (const role of intent.requiredRoles) {
    const matches = nearby.filter(
      (v) =>
        venueRoles(v).includes(role) &&
        (!intent.upscaleMeal || role !== "meal" || v.upscale),
    );
    if (!matches.length)
      return `No sourced ${role === "meal" && intent.upscaleMeal ? "fine-dining" : role} places match this area. Try a different activity or area.`;
    const lowest = Math.min(...matches.map((v) => spendAllowance(v, intent)));
    if (lowest > Number(prefs.budget))
      return `The ${role === "meal" && intent.upscaleMeal ? "fine-dining meal" : role} allowances here start at ~$${lowest} each, above your $${prefs.budget} budget. Increase the budget or choose a cheaper activity.`;
    if (!candidates.some((v) => venueRoles(v).includes(role)))
      return `The requested ${role === "meal" ? "restaurants" : role + " spots"} have no confirmed opening window that fits your date, start time and duration. Change the time or date.`;
  }
  for (const tag of intent.requiredTags) {
    const matches = nearby.filter((v) => coversTag([v], tag));
    if (!matches.length)
      return `No sourced places for ${tag.toLowerCase()} are available in this area. Try another area or remove that activity.`;
    const lowest = Math.min(...matches.map((v) => spendAllowance(v, intent)));
    if (lowest > Number(prefs.budget))
      return `The ${tag.toLowerCase()} allowances here start at ~$${lowest} each, above your $${prefs.budget} budget. Increase the budget or change that activity.`;
    if (!coversTag(candidates, tag))
      return `No published opening window for ${tag.toLowerCase()} fits these details. Change the date or start time, or remove that activity.`;
  }
  return "No cohesive route fits all your interests, budget, opening hours and travel time. Increase the budget or duration, change the start time, or remove an activity.";
}
