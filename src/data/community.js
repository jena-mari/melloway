import { venues } from "./venues.js";
import { defaultDraft } from "./preferences.js";
import { demoMatrix, schedule } from "../utils/planner.js";

// Bundle the existing illustrative photos so starter cards also work offline.
const photoAssets = {
  "1515823064-d6e0c04616a7": "/images/community/matcha.jpg",
  "1507842217343-583bb7270b66": "/images/community/books.jpg",
  "1488477181946-6428a0291777": "/images/community/dessert.jpg",
  "1577083552431-6e5fd01aa342": "/images/community/art.jpg",
  "1506973035872-a4ec16b8e8d9": "/images/community/sydney.jpg",
  "1555939594-58d7cb561ad1": "/images/community/food.jpg",
};

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
    const moodPhotos = {
      "matcha-newtown": "newtown-0",
      kingst: "newtown-1",
      "brunch-sh": "surry-3",
      agnsw: "cbd-2",
      botanic: "cbd-5",
      quay: "cbd-5",
    };
    const stops = ids.map((id) => {
      const venue = venues.find((v) => v.id === id);
      const photo = venues.find((v) => v.id === moodPhotos[id]);
      const image = photo?.image || venue.image;
      const photoId = image?.match(/\/photo-([^?]+)/)?.[1];
      return { ...venue, image: photoAssets[photoId] || image };
    });
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
