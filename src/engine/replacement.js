import { schedule, km } from "../utils/planner.js";
import {
  interpretPreferences,
  venueRoles,
  timeSuitable,
  coversTag,
} from "./preferences.js";
import { explanationFor } from "./scoring.js";
import { venueRejection } from "./filtering.js";

export function replaceExperienceStop(plan, index, candidates, prefs, matrix) {
  if (!Number.isInteger(index) || index < 0 || index >= plan.stops.length)
    return null;
  const intent = plan.intent || interpretPreferences(prefs),
    role = plan.stops[index].activityRole || venueRoles(plan.stops[index])[0];
  let best = null,
    bestScore = -Infinity;
  for (const v of candidates) {
    if (
      plan.stops.some((s) => s.id === v.id || s.name === v.name) ||
      !venueRoles(v).includes(role) ||
      venueRejection(v, prefs, intent, plan.rejectedIds || [])
    )
      continue;
    const stops = plan.stops.map((s, i) =>
      i === index
        ? {
            ...v,
            activityRole: role,
            reason: explanationFor(v, intent, role, i),
          }
        : s,
    );
    if (
      stops.some(
        (s, i) =>
          i &&
          km(s, stops[i - 1]) >
            (intent.allowTravel ? 8 : prefs.transport === "Walking" ? 2.5 : 4),
      )
    )
      continue;
    const indices = stops.map((s) =>
      candidates.findIndex((c) => c.id === s.id),
    );
    if (indices.some((i) => i < 0)) continue;
    const next = schedule(stops, prefs, matrix, indices);
    if (
      !next ||
      next.stops.some((s) => !timeSuitable(s, s.arrival)) ||
      next.stops.some(
        (s) =>
          s.travelFromPrevious?.minutes >
          (intent.allowTravel ? 90 : prefs.transport === "Walking" ? 45 : 35),
      ) ||
      intent.requiredTags.some(
        (tag) => coversTag(plan.stops, tag) && !coversTag(next.stops, tag),
      )
    )
      continue;
    const score = v.score - next.travel * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = {
        ...next,
        stops: next.stops.map((s, i) => ({
          ...s,
          activityRole: stops[i].activityRole,
          reason: stops[i].reason,
        })),
        rejectedIds: [
          ...new Set([...(plan.rejectedIds || []), plan.stops[index].id]),
        ],
      };
    }
  }
  return best;
}
