export const ideas = [
  {
    id: "outdoor-energy",
    title: "high energy outdoor activities",
    drawing: "outdoor",
    tags: ["Scenic walks", "Beaches"],
    atmosphere: ["outdoor", "lively"],
    period: "daytime",
  },
  {
    id: "books-art",
    title: "indie bookshops and art museums",
    drawing: "libraryart",
    tags: ["Bookshops", "Art galleries", "Museums"],
    atmosphere: ["creative", "quiet"],
    period: "daytime",
  },
  {
    id: "wine-dinner",
    title: "sleek wine bar and smart-casual dinner",
    drawing: "winefancy",
    tags: ["Cocktail bars", "Dinner"],
    atmosphere: ["sophisticated", "intimate"],
    period: "evening",
  },
  {
    id: "homebody-cozy",
    title: "homebody and cozy",
    drawing: "cozy",
    tags: ["Coffee shops", "Desserts"],
    atmosphere: ["quiet", "relaxed", "intimate"],
    pace: "slow",
    period: "daytime",
  },
  {
    id: "live-music",
    title: "live music and dynamic environments",
    drawing: "livemusic",
    tags: ["Live music"],
    atmosphere: ["lively", "creative"],
    period: "evening",
  },
];

// Existing saved plans retain the interests they originally selected.
const legacyIdeas = [
  { id: "market-matcha", tags: ["Flea markets", "Matcha cafés"] },
  { id: "vintage-photos", tags: ["Vintage stores", "Photo spots"] },
  { id: "books-coffee", tags: ["Bookshops", "Coffee shops"] },
  { id: "art-picnic", tags: ["Art galleries", "Picnics"] },
];
export function findIdea(id) {
  return ideas.find((idea) => idea.id === id) || legacyIdeas.find((idea) => idea.id === id);
}
export function currentIdeaId(id) {
  if (ideas.some((idea) => idea.id === id)) return id;
  return {
    "market-matcha": "homebody-cozy",
    "vintage-photos": "books-art",
    "books-coffee": "books-art",
    "art-picnic": "books-art",
  }[id] || ideas[0].id;
}
