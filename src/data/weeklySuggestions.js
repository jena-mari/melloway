import { sydneyToday, validDate } from "../utils/date.js";

// Publish another dated edition here to change the highlight each week.
// Keep the last published edition visible until a new one is ready.
export const weeklyEditions = [
  {
    weekOf: "2026-10-05",
    suggestions: [
      {
        id: "macquarie-ice-rink",
        name: "Macquarie Ice Rink",
        activity: "Ice skating",
        area: "North Ryde",
        planArea: "Anywhere in Sydney",
        address: "Level 1, Macquarie Centre, Herring Rd & Waterloo Rd, North Ryde NSW 2113",
        doodle: "duo",
        tags: [],
        keywords: ["ice skating", "skating", "active", "sport"],
        description: "A public skating session. Skate hire is available; tickets are sold at the rink.",
        visit: "Check public session times before going.",
        price: "$32 adult admission with skate hire; other ticket types vary.",
        knownCost: 32,
        website: "https://macquarieicerink.com.au/",
      },
      {
        id: "astros-arcade-bar",
        name: "Astro’s Arcade Bar",
        activity: "Arcade games",
        area: "Newtown",
        planArea: "Newtown",
        address: "22 King St, Newtown NSW 2042",
        doodle: "cat",
        tags: ["Arcades"],
        keywords: ["arcade", "games", "gaming", "play"],
        description: "Retro arcade games, pinball and drinks.",
        visit: "Tue–Thu 5–11pm · Fri–Sat 5pm–midnight · Sun 1–7pm. Check special events and changes.",
        price: "Game and drink prices vary; check the venue.",
        knownCost: null,
        website: "https://www.astrosarcadebar.com/",
      },
      {
        id: "caterpillar-club",
        name: "The Caterpillar Club",
        activity: "Live music & drinks",
        area: "Sydney CBD",
        planArea: "Sydney CBD",
        address: "92 Pitt St, Sydney NSW 2000",
        doodle: "music",
        tags: ["Live music", "Cocktail bars"],
        keywords: ["music", "jazz", "cocktail", "bar", "dancing"],
        description: "Live bands, vinyl DJs and cocktails in an underground bar.",
        visit: "Sun–Wed 5pm–3am · Thu–Sat 5pm–4am. Walk-ins only; check the programme.",
        price: "Drink prices vary; check the menu.",
        knownCost: null,
        website: "https://swillhouse.com/venues/the-caterpillar-club/",
      },
    ].map((suggestion) => ({ ...suggestion, checkedAt: "2026-10-11" })),
  },
];

export function weeklyEdition(date = sydneyToday(), editions = weeklyEditions) {
  if (!validDate(date)) return null;
  return editions
    .filter((edition) => validDate(edition.weekOf) && edition.weekOf <= date)
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0] || null;
}

export function weeklyDateLabel(edition) {
  const start = new Date(`${edition.weekOf}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const format = new Intl.DateTimeFormat("en-AU", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
  return `${format.format(start)} – ${format.format(end)}`;
}

export function findWeeklySuggestion(id, date = sydneyToday(), editions = weeklyEditions) {
  if (!validDate(date)) return null;
  return editions.filter((edition) => validDate(edition.weekOf) && edition.weekOf <= date)
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf))
    .flatMap((edition) => edition.suggestions).find((item) => item.id === id) || null;
}

const searchText = (value) => value.toLowerCase().replace(/[’‘']/g, "");
export function weeklyMatches(edition, prefs = {}, query = "") {
  if (!edition) return [];
  const search = searchText(query.trim());
  const interests = searchText([...(prefs.preferences || []), prefs.notes || "", prefs.idea || ""].join(" "));
  const budget = Number(prefs.budget);
  return edition.suggestions
    .filter((item) => !search || searchText([item.name, item.activity, item.area, item.address, ...item.keywords]
      .join(" ")).includes(search))
    .map((item, index) => ({
      item, index,
      score: item.keywords.some((word) => interests.includes(word)) ? 2 : 0,
      overBudget: Number.isFinite(budget) && prefs.budget !== "" && prefs.budget != null &&
        Number.isFinite(item.knownCost) && item.knownCost > budget,
    }))
    .sort((a, b) => (b.score - Number(b.overBudget)) - (a.score - Number(a.overBudget)) || a.index - b.index)
    .map(({ item }) => item);
}

export function weeklyPlanPatch(item, prefs) {
  const request = `${item.activity} at ${item.name}, ${item.address}.`;
  const notes = prefs.notes || "";
  return {
    area: item.planArea,
    location: null,
    locationQuery: item.planArea,
    preferences: [...new Set([...(prefs.preferences || []), ...item.tags])],
    notes: notes.includes(request) ? notes : [notes.trim(), request].filter(Boolean).join("\n"),
  };
}
