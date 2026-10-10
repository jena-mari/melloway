import { ideas } from "../data/ideas.js";
const aliases = [
  ["Flea markets", /\b(?:flea markets?|markets?)\b/gi],
  ["Thrifting", /\b(?:thrift(?:ing)?|second[- ]hand)\b/gi],
  ["Vintage stores", /\bvintage\b/gi],
  ["Matcha cafés", /\bmatcha\b/gi],
  ["Coffee shops", /\bcoffee\b/gi],
  ["Jazz bars", /\bjazz\b/gi],
  ["Live music", /\b(?:live music|gigs?)\b/gi],
  ["Beaches", /\bbeach(?:es)?\b/gi],
  ["Bookshops", /\b(?:books?|bookshops?|bookstores?)\b/gi],
  ["Art galleries", /\b(?:art|galler(?:y|ies))\b/gi],
  ["Asian food", /\b(?:asian|adobo|dim\s?sum|sushi|ramen|dumplings?)\b/gi],
  ["Italian food", /\b(?:italian|pasta|pizza)\b/gi],
  ["Brunch", /\bbrunch\b/gi],
  ["Dinner", /\bdinner\b/gi],
  ["Desserts", /\b(?:desserts?|ice cream|cakes?)\b/gi],
  ["Street food", /\bstreet food\b/gi],
  ["Escape rooms", /\bescape rooms?\b/gi],
  ["Music festivals", /\bfestivals?\b/gi],
  ["Arcades", /\barcades?\b/gi],
  ["Museums", /\bmuseums?\b/gi],
  ["Photo spots", /\b(?:photos?|photobooths?|photo booths?|photography)\b/gi],
  ["Picnics", /\bpicnics?\b/gi],
  ["Shopping", /\bshopping\b/gi],
  ["Scenic walks", /\b(?:walks?|walking|scenic)\b/gi],
];
const negative =
  /(?:\bno\b|\bnot(?:\s+into)?\b|\bavoid\b|\bhate\b|\bdislike\b|\bwithout\b|don[’']?t\s+(?:like|want|drink)|can[’']?t\s+have)\s+(?:[\w’']+\s+){0,4}$/i;
// A small, explicit interest matcher. Unrecognised requests remain attached as
// notes; this does not claim dietary, accessibility or booking verification.
export function interestsFromNotes(text = "") {
  const included = new Set(),
    excluded = new Set();
  const clauses = text.split(/[.!?;,\n]|\b(?:but|however|and)\b/i);
  for (const [tag, pattern] of aliases) {
    for (const clause of clauses) {
      for (const match of clause.matchAll(pattern)) {
        const before = clause.slice(0, match.index).slice(-65);
        (negative.test(before) ? excluded : included).add(tag);
      }
    }
  }
  return {
    included: [...included].filter((tag) => !excluded.has(tag)),
    excluded: [...excluded],
  };
}
export function preferencesForPlan(draft) {
  const { included, excluded } = interestsFromNotes(draft.notes || "");
  const suggestion = ideas.find((idea) => idea.id === draft.idea);
  return [
    ...new Set([
      ...(draft.preferences || []),
      ...(suggestion?.tags || []),
      ...included,
    ]),
  ].filter((tag) => !excluded.includes(tag));
}
