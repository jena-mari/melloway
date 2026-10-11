import { km, schedule } from "../utils/planner.js";
import { planningArea } from "../utils/location.js";
import { venueRoles } from "./preferences.js";
import { scoreVenue } from "./scoring.js";

import { closedOn } from "../utils/openingHours.js";
export function spendAllowance(v, intent) {
  return v.foodAllowance &&
    intent.interests.some((t) => ["Brunch", "Café food"].includes(t))
    ? v.foodAllowance
    : v.cost;
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
  if (
    !Number.isFinite(v.cost) ||
    spendAllowance(v, intent) > Number(prefs.budget)
  )
    return "budget";
  if (
    intent.upscaleMeal &&
    rs.includes("meal") &&
    !v.upscale &&
    !v.tags.includes("Fine dining")
  )
    return "preference";
  if (
    intent.hiddenBars &&
    rs.includes("bar") &&
    !v.hidden &&
    !v.tags.includes("Speakeasies")
  )
    return "preference";
  if (
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
    !schedule(
      [v],
      prefs,
      [[{ minutes: 0, distance: 0, source: "estimate" }]],
      [0],
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
    .map((v) => ({ ...v, cost: spendAllowance(v, intent) }))
    .filter((v) => !venueRejection(v, prefs, intent, rejectedIds))
    .map((v) => scoreVenue(v, prefs, intent, weights))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Keep representatives of every requested role before filling the bounded pool.
  const chosen = [];
  const add = (v) => {
    if (v && !chosen.some((c) => c.id === v.id || c.name === v.name))
      chosen.push(v);
  };
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
