import { optimiseExperience } from "./generation.js";
import { activityTemplates } from "./sequencing.js";
import { coversTag, venueRoles, interestRole } from "./preferences.js";

// Positive interests are flexible; exclusions, venue facts and scheduling stay
// intact. Prefer a related activity over simply filling the day with cheap stops.
const related = {
  shop: { bookshop: 0.85, culture: 0.5, walk: 0.2 },
  bookshop: { shop: 0.85, culture: 0.65, cafe: 0.3 },
  cafe: { dessert: 0.85, meal: 0.6, bar: 0.2 },
  meal: { cafe: 0.7, dessert: 0.35, bar: 0.3 },
  bar: { meal: 0.6, activity: 0.45, cafe: 0.3 },
  culture: { bookshop: 0.7, walk: 0.6, activity: 0.5 },
  walk: { culture: 0.65, activity: 0.5, bookshop: 0.3 },
  dessert: { cafe: 0.85, meal: 0.4 },
  activity: { culture: 0.75, walk: 0.65, shop: 0.4 },
};
const roleNames = {
  shop: "Shopping",
  bookshop: "Bookshops",
  cafe: "Cafés",
  meal: "Dining",
  bar: "Bars",
  culture: "Art and culture",
  walk: "Scenic walks",
  dessert: "Desserts",
  activity: "Activities",
};
const similarity = (wanted, actual) =>
  wanted === actual ? 1 : related[wanted]?.[actual] || 0;
export const alternativeIntent = (intent) => ({
  ...intent,
  allowAlternatives: true,
  requiredRoles: [...new Set((intent.requiredActivities || []).map(activity => activity.role))],
  requiredTags: (intent.requiredActivities || []).map(activity => activity.query),
  upscaleMeal: false,
  hiddenBars: false,
});

function alternativeTemplates(candidates, intent) {
  const available = new Set(candidates.flatMap(venueRoles));
  const requested = intent.requiredRoles;
  const templates = Object.values(activityTemplates).flat();
  if (requested.length > 1 && requested.length <= 4) templates.push(requested);
  templates.push(["bar", "bar"], ...[...available].map((r) => [r]));
  return [
    ...new Map(
      templates
        .flatMap((t) => [t, [...t].reverse()])
        .filter((t) => t.every((r) => available.has(r)))
        .map((t) => [t.join("|"), t]),
    ).values(),
  ];
}

export function closestExperience(
  candidates,
  prefs,
  matrix,
  requested,
  options = {},
) {
  const active = alternativeIntent(requested);
  const scoreBonus = (plan, sequence) => {
    const stops = plan.stops.map((v, i) => ({
      ...v,
      activityRole: sequence[i],
    }));
    const tags = requested.requiredTags;
    const tagCoverage = tags.length
      ? tags.filter((t) => coversTag(stops, t)).length / tags.length
      : 0;
    const roleCoverage = requested.requiredRoles.length
      ? requested.requiredRoles.reduce(
          (sum, role) =>
            sum + Math.max(0, ...sequence.map((r) => similarity(role, r))),
          0,
        ) / requested.requiredRoles.length
      : 0;
    // Retaining requested activities outweighs price/variety padding. Existing
    // scores break close ties by atmosphere and proximity to the chosen area.
    return tagCoverage * 1000 + roleCoverage * 300;
  };
  const searchOptions = {
    ...options,
    templates: alternativeTemplates(candidates, requested),
    scoreBonus,
  };
  let plan = optimiseExperience(candidates, prefs, matrix, active, {
    ...searchOptions,
    excludeSignature: undefined,
  });
  if (plan && options.excludeSignature) {
    const other = optimiseExperience(
      candidates,
      prefs,
      matrix,
      active,
      searchOptions,
    );
    // A regeneration may vary places, but it must not sacrifice relevance just
    // to change the route. Return the unchanged best match when necessary.
    if (
      other &&
      scoreBonus(other, other.sequence) >= scoreBonus(plan, plan.sequence)
    )
      plan = other;
  }
  if (!plan) return null;
  const missingTags = requested.requiredTags.filter(
    (tag) => !coversTag(plan.stops, tag),
  );
  const missingRoles = requested.requiredRoles.filter(
    (r) =>
      !plan.sequence.includes(r) &&
      !missingTags.some((t) => interestRole(t) === r),
  );
  const missing = [
    ...missingTags.map((tag) => ({ label: tag, role: interestRole(tag) })),
    ...missingRoles.map((role) => ({ label: roleNames[role], role })),
  ];
  const adjustments = missing.map(({ label, role }) => {
    const stop = [...plan.stops].sort(
      (a, b) =>
        similarity(role, b.activityRole) - similarity(role, a.activityRole) ||
        b.score - a.score,
    )[0];
    return { requested: label, alternative: stop.category, venueId: stop.id };
  });
  const matchNotice = adjustments.length
    ? `Closest match: ${adjustments.map((a) => `${a.alternative} instead of ${a.requested}`).join("; ")}.`
    : "Closest match: an available route within your time and budget.";
  return {
    ...plan,
    requestedIntent: requested,
    intent: {
      ...active,
      requiredRoles: [...new Set(plan.sequence)],
      requiredTags: requested.requiredTags.filter((t) =>
        coversTag(plan.stops, t),
      ),
    },
    matchNotice,
    adjustments,
    stops: plan.stops.map((v) => {
      const replacements = adjustments.filter((a) => a.venueId === v.id);
      return replacements.length
        ? {
            ...v,
            reason: `${v.description || v.category + " in " + v.area + "."} Nearby alternative for ${replacements.map((a) => a.requested.toLowerCase()).join(" and ")}.`,
          }
        : v;
    }),
  };
}
