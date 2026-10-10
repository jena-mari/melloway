import { venues } from "./venues.js";
import { defaultDraft } from "./preferences.js";
import { demoMatrix, schedule } from "../utils/planner.js";

const examples = [
  {
    id: "example1",
    planId: "c0000000-0000-4000-8000-000000000001",
    author: "Zoe",
    handle: "zoe.takes.it.slow",
    colour: "pink",
    name: "a slow saturday in newtown",
    area: "Newtown",
    description:
      "matcha first, then the vintage racks. finished with something sweet. honestly, the best dates leave room to wander.",
    stops: ["matcha-newtown", "kingst", "newtown-4"],
    rating: 5,
  },
  {
    id: "example2",
    planId: "c0000000-0000-4000-8000-000000000002",
    author: "Kai",
    handle: "kai.outside",
    colour: "green",
    name: "harbour views & happy hearts",
    area: "Sydney CBD",
    description:
      "art, a garden picnic, and a long walk by the water. bring someone who’s happy to take the scenic way.",
    stops: ["agnsw", "botanic", "quay"],
    rating: 5,
  },
  {
    id: "example3",
    planId: "c0000000-0000-4000-8000-000000000003",
    author: "Mia",
    handle: "mia.after.coffee",
    colour: "yellow",
    name: "just one more coffee",
    area: "Surry Hills",
    description:
      "brunch that turns into a bookshop browse that turns into a gallery detour. a solid little afternoon with a friend.",
    stops: ["brunch-sh", "surry-1", "surry-2"],
    rating: 4,
  },
];

export function communityExamples() {
  return examples.map(({ stops: ids, planId, ...post }) => {
    const stops = ids.map((id) => venues.find((venue) => venue.id === id));
    const prefs = {
      ...defaultDraft(),
      area: post.area,
      name: post.author,
      preferences: [...new Set(stops.flatMap((stop) => stop.tags))],
    };
    const route = schedule(
      stops,
      prefs,
      demoMatrix(stops, prefs.transport),
      [0, 1, 2],
    );
    return {
      ...post,
      sample: true,
      image: stops[0].image,
      plan: {
        ...route,
        id: planId,
        prefs,
        notice:
          "Example community route. Demo venues, sample hours and estimated costs; photos are illustrative.",
      },
    };
  });
}
