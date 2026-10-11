import { interestsFromNotes } from "../utils/interests.js";
import { diningVibes } from "../data/preferences.js";

export const roles = [
  "cafe",
  "shop",
  "bookshop",
  "culture",
  "walk",
  "meal",
  "bar",
  "dessert",
  "activity",
];
export const atmospheres = [
  "romantic",
  "intimate",
  "dimly-lit",
  "upscale",
  "sophisticated",
  "relaxed",
  "lively",
  "creative",
  "outdoor",
  "quiet",
  "hidden",
  "casual",
];
const roleForTag = {
  Speakeasies: "bar",
  "Cocktail bars": "bar",
  "Jazz bars": "bar",
  "Live music": "bar",
  "Fine dining": "meal",
  "Asian food": "meal",
  "Italian food": "meal",
  Dinner: "meal",
  "Street food": "meal",
  "Matcha cafés": "cafe",
  "Coffee shops": "cafe",
  "Café food": "cafe",
  Brunch: "cafe",
  Thrifting: "shop",
  "Vintage stores": "shop",
  Shopping: "shop",
  "Flea markets": "shop",
  Bookshops: "bookshop",
  "Art galleries": "culture",
  Museums: "culture",
  "Scenic walks": "walk",
  Picnics: "walk",
  Beaches: "walk",
  "Photo spots": "walk",
  Desserts: "dessert",
  "Photo booths": "activity",
  Arcades: "activity",
  "Escape rooms": "activity",
  "Music festivals": "activity",
};
export const interestRole = (tag) => roleForTag[tag];
const positive = (text, pattern) =>
  text.split(/[.!?;,\n]|\b(?:but|however|and)\b/i).some((clause) => {
    const m = clause.match(pattern);
    return (
      m &&
      !/(?:\bno|\bnot|\bavoid|\bwithout|\bhate|\bdislike|don[’']?t (?:want|like|drink))\s+(?:[\w'-]+\s+){0,3}$/i.test(
        clause.slice(0, m.index),
      )
    );
  });
const unique = (values) => [...new Set(values)];

export function interpretPreferences(prefs) {
  const text = prefs.notes || "";
  const parsed = interestsFromNotes(text);
  const explicit = unique([
    ...(prefs.selectedPreferences || prefs.preferences || []),
    ...parsed.included,
  ]).filter((t) => !parsed.excluded.includes(t));
  const interests = unique([...(prefs.preferences || []), ...explicit]).filter(
    (t) => !parsed.excluded.includes(t),
  );
  const atmosphere = [];
  const diningAtmosphere = unique(
    (prefs.diningVibes || []).flatMap((vibe) => diningVibes[vibe] || []),
  );
  if (
    positive(text, /\b(?:romantic|intimate|speakeas(?:y|ies)|hidden bars?)\b/i)
  )
    atmosphere.push("romantic", "intimate", "dimly-lit");
  if (
    positive(text, /\b(?:fancy|fine dining|upscale|sophisticated|elegant)\b/i)
  )
    atmosphere.push("upscale", "sophisticated");
  for (const [tag, pattern] of [
    ["relaxed", /\b(?:chill|relax(?:ed|ing)?|slow|casual)\b/i],
    ["quiet", /\bquiet\b/i],
    ["lively", /\b(?:lively|party|energetic)\b/i],
    ["creative", /\b(?:art|creative)\b/i],
    ["outdoor", /\b(?:outdoor|scenic|walks?|picnic)\b/i],
  ])
    if (positive(text, pattern)) atmosphere.push(tag);
  const upscaleMeal =
    interests.includes("Fine dining") ||
    positive(
      text,
      /\b(?:fine dining|fancy (?:dinner|restaurant)|upscale (?:dinner|restaurant))\b/i,
    );
  const hiddenBars =
    interests.includes("Speakeasies") ||
    positive(text, /\b(?:speakeas(?:y|ies)|hidden (?:cocktail )?bars?)\b/i);
  if (upscaleMeal) interests.push("Fine dining");
  if (hiddenBars) interests.push("Speakeasies");
  const requiredRoles = unique(
    explicit.map((t) => roleForTag[t]).filter(Boolean),
  );
  if (upscaleMeal && !requiredRoles.includes("meal"))
    requiredRoles.push("meal");
  if (hiddenBars && !requiredRoles.includes("bar")) requiredRoles.push("bar");
  if (
    positive(
      text,
      /\b(?:affordable food|cheap food|eat(?:ing)? out|casual dinner)\b/i,
    ) &&
    !requiredRoles.includes("meal")
  )
    requiredRoles.push("meal");
  const evening =
    upscaleMeal ||
    hiddenBars ||
    positive(text, /\b(?:evening|night|dinner)\b/i);
  return {
    interests: unique(interests),
    atmosphere: unique(atmosphere),
    diningAtmosphere,
    requiredRoles,
    requiredTags: explicit.filter((t) => t !== "Shopping"),
    excludedTags: parsed.excluded,
    excludedRoles: unique(
      parsed.excluded
        .filter((t) => ["Dinner", "Cocktail bars", "Speakeasies"].includes(t))
        .map((t) => roleForTag[t]),
    ),
    upscaleMeal,
    hiddenBars,
    period: evening ? "evening" : "daytime",
    pace: positive(text, /\b(?:slow|chill|relax(?:ed|ing)?|not rushed)\b/i)
      ? "slow"
      : "balanced",
    allowTravel: positive(
      text,
      /\b(?:happy to travel|willing to travel|don't mind travelling)\b/i,
    ),
  };
}

export function validIntent(value) {
  return (
    !!value &&
    Array.isArray(value.requiredRoles) &&
    value.requiredRoles.length <= roles.length &&
    value.requiredRoles.every((r) => roles.includes(r)) &&
    Array.isArray(value.atmosphere) &&
    value.atmosphere.length <= atmospheres.length &&
    value.atmosphere.every((a) => atmospheres.includes(a)) &&
    ["daytime", "evening"].includes(value.period) &&
    ["slow", "balanced"].includes(value.pace) &&
    typeof value.upscaleMeal === "boolean" &&
    typeof value.hiddenBars === "boolean"
  );
}
export function mergeIntent(local, ai) {
  if (!validIntent(ai)) throw new Error("Invalid interpreted preferences");
  const requiredRoles = unique([
    ...local.requiredRoles,
    ...ai.requiredRoles,
  ]).filter((r) => !local.excludedRoles?.includes(r));
  const upscaleMeal =
    !local.excludedTags.includes("Fine dining") &&
    !local.excludedRoles?.includes("meal") &&
    (local.upscaleMeal || ai.upscaleMeal);
  const hiddenBars =
    !local.excludedTags.includes("Speakeasies") &&
    !local.excludedRoles?.includes("bar") &&
    (local.hiddenBars || ai.hiddenBars);
  if (upscaleMeal && !requiredRoles.includes("meal"))
    requiredRoles.push("meal");
  if (hiddenBars && !requiredRoles.includes("bar")) requiredRoles.push("bar");
  return {
    ...local,
    requiredRoles,
    atmosphere: unique([...local.atmosphere, ...ai.atmosphere]),
    upscaleMeal,
    hiddenBars,
    period: local.period === "evening" ? "evening" : ai.period,
    pace: local.pace === "slow" ? "slow" : ai.pace,
  };
}

export function resolvePlanningTime(prefs, intent) {
  // A chosen clock time always wins. Infer evening only for an untouched default.
  const explicit =
    prefs.timeExplicit === true ||
    (!prefs.inferredTime && !!prefs.time && prefs.time !== "11:00");
  if (explicit) return { prefs, notice: "" };
  if (intent.period !== "evening")
    return {
      prefs: prefs.inferredTime
        ? { ...prefs, time: "11:00", inferredTime: false }
        : prefs,
      notice: "",
    };
  const match = (prefs.notes || "").match(
    /\b(?:at|start(?:ing)?(?: at)?)\s+(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i,
  );
  const h = match
    ? (Number(match[1]) % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0)
    : 18;
  const time = `${String(h).padStart(2, "0")}:${match?.[2] || "00"}`;
  return {
    prefs: { ...prefs, time, inferredTime: true },
    notice: ` Start ${time} inferred from your notes; change it in details.`,
  };
}

export function venueRoles(v) {
  return (
    v.roles ||
    unique((v.tags || []).map((t) => roleForTag[t]).filter(Boolean)).slice(0, 2)
  );
}
export function coversTag(stops, tag) {
  const role = roleForTag[tag];
  return stops.some(
    (v) =>
      v.tags.includes(tag) &&
      (!role ||
        (v.activityRole
          ? v.activityRole === role
          : venueRoles(v).includes(role))),
  );
}
export function venueAtmosphere(v) {
  return v.atmosphere || [];
}
export function timeSuitable(
  v,
  arrival,
  role = v.activityRole || venueRoles(v)[0],
) {
  const clock = ((arrival % 1440) + 1440) % 1440;
  if (role === "cafe" && v.category === "Brunch") return clock < 1020;
  if (role === "bar") return clock >= 960 || clock < 180;
  if (role === "meal")
    return (clock >= 690 && clock <= 870) || (clock >= 1020 && clock <= 1320);
  return true;
}
