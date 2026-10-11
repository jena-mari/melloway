import { km, schedule, transportAllowance } from "../utils/planner.js";
import { planningArea } from "../utils/location.js";
import { venueRoles } from "./preferences.js";
import { scoreVenue } from "./scoring.js";
import { sameBusiness } from "./discoveryPool.ts";
import {
  estimatedCost,
  allocateActivityBudgets,
} from "../utils/activityBudget.js";

import { closedOn } from "../utils/openingHours.js";
export function spendAllowance(v, intent) {
  return v.foodAllowance &&
    intent.interests.some((t) => ["Brunch", "Café food"].includes(t))
    ? v.foodAllowance
    : estimatedCost(v);
}
export function venueRejection(v, prefs, intent, rejectedIds = []) {
  const area = planningArea(prefs),
    rs = venueRoles(v);
  if (v.source === "demo") return "demo";
  if (rejectedIds.includes(v.id)) return "rejected";
  if (
    !Number.isFinite(v.lat) ||
    !Number.isFinite(v.lng) ||
    km(v, area) > area.r
  )
    return "area";
  if (closedOn(v, prefs.date)) return "hours";
  if (!v.weeklyHours && !v.hours) return "unknown-hours";
  const spending = spendAllowance(v, intent);
  const versions = (
    v.activityRole ? [v.activityRole] : rs.length ? rs : [undefined]
  ).map((activityRole) => ({
    ...v,
    activityRole,
    cost: spending,
    estimatedCost: spending,
  }));
  if (
    !Number.isFinite(v.cost) ||
    spending > Number(prefs.budget) ||
    !versions.some((venue) =>
      allocateActivityBudgets(
        [venue],
        prefs,
        transportAllowance(prefs.transport),
      ),
    )
  )
    return "budget";
  if (
    !intent.allowAlternatives &&
    intent.upscaleMeal &&
    rs.includes("meal") &&
    !v.upscale &&
    !v.tags.includes("Fine dining")
  )
    return "preference";
  if (
    !intent.allowAlternatives &&
    intent.hiddenBars &&
    rs.includes("bar") &&
    !v.hidden &&
    !v.tags.includes("Speakeasies")
  )
    return "preference";
  if (
    !intent.allowAlternatives &&
    intent.interests.includes("Matcha cafés") &&
    rs.includes("cafe") &&
    !v.tags.includes("Matcha cafés")
  )
    return "preference";
  if (
    intent.excludedRoles?.some((r) => rs.includes(r)) ||
    intent.excludedTags.some(
      (t) => v.category === t || (t !== "Coffee shops" && v.tags.includes(t)),
    )
  )
    return "preference";
  if (
    !versions.some((venue) =>
      schedule(
        [venue],
        prefs,
        [[{ minutes: 0, distance: 0, source: "estimate" }]],
        [0],
      ),
    )
  )
    return "hours";
  return null;
}
export function selectCandidates(
  all,
  prefs,
  intent,
  { rejectedIds = [], weights, seed = 0 } = {},
) {
  const eligible = all
    .map((v) => ({
      ...v,
      cost: spendAllowance(v, intent),
      estimatedCost: spendAllowance(v, intent),
    }))
    .filter((v) => !venueRejection(v, prefs, intent, rejectedIds))
    .map((v) => scoreVenue(v, prefs, intent, weights))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Curated venues are the primary catalogue. In a mixed pool reserve up to half
  // the shortlist for the best eligible curated matches, with requested-role
  // coverage first. This reserves candidates, never mandatory itinerary stops.
  const chosen = [];
  const add = (v) => {
    if (v && chosen.length < 14 && !chosen.some((c) => sameBusiness(c, v)))
      chosen.push(v);
  };
  if (eligible.some((v) => v.source === "google")) {
    const curated = eligible.filter((v) => v.source === "curated");
    for (const role of intent.requiredRoles)
      add(curated.find((v) => venueRoles(v).includes(role)) ||
        eligible.find((v) => venueRoles(v).includes(role)));
    const target = Math.min(7, curated.length);
    for (const v of curated) {
      if (chosen.filter((c) => c.source === "curated").length >= target) break;
      add(v);
    }
  }
  // Retain additional choices for each role before filling by the shared score.
  for (const role of intent.requiredRoles)
    eligible
      .filter((v) => venueRoles(v).includes(role))
      .slice(0, 3)
      .forEach(add);
  for (const v of eligible) {
    if (chosen.length >= 14) break;
    add(v);
  }
  return chosen.slice(0, 14);
}
