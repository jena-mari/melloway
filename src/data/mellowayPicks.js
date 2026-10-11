import { defaultDraft, sydneyToday } from "./preferences.js";
import { demoMatrix, schedule } from "../utils/planner.js";
import { offsetDate } from "../utils/openingHours.js";
import { validDate } from "../utils/date.js";

const checkedAt = "2026-10-11";
const daily = (open, close) =>
  Array.from({ length: 7 }, () => [{ open, close }]);
function cafe(
  id,
  name,
  address,
  lat,
  lng,
  mins,
  cost,
  website,
  weeklyHours,
  reason,
  hoursStatus = "published",
) {
  return {
    id: `pick-matcha-${id}`,
    name,
    address,
    lat,
    lng,
    mins,
    cost,
    website,
    weeklyHours,
    area: "Sydney CBD",
    category: "Matcha café",
    tags: ["Matcha cafés", "Desserts"],
    roles: ["cafe"],
    activityRole: "cafe",
    atmosphere: ["relaxed", "casual"],
    source: "curated",
    coordinatesStatus: "approximate",
    priceStatus: "estimate",
    hoursStatus,
    checkedAt,
    reason,
    note: `${hoursStatus === "reported" ? "Hours are reported in a directory; confirm with the café." : "Published hours checked 11 Oct 2026; confirm changes and holidays."} Drink spend and visit length are allowances; map position is approximate.`,
    sources: [
      {
        url: website,
        checkedAt,
        fields: [
          "name",
          "address",
          ...(hoursStatus === "published" ? ["published hours"] : []),
        ],
      },
    ],
  };
}

// Editorial picks are separate from the recommendation pool. Branches and order
// stay deliberate; the planner checks this exact route instead of choosing cafés.
export const mellowayPicks = [
  {
    id: "sydney-matcha-crawl",
    name: "The Ultimate Sydney Matcha Crawl",
    shortName: "Sydney Matcha Crawl",
    planIdPrefix: "a1111111-1111-4111-8111",
    author: "melloway",
    area: "Haymarket → Sydney CBD",
    description: "5 stops. One matcha-filled day.",
    start: "Central Station",
    time: "10:30",
    suggestedArrivals: [630, 675, 720, 765, 810],
    duration: 4,
    walkingEstimate: "30–45 min",
    durationEstimate: "3–4 hours",
    walkingRanges: [
      [7, 10],
      [5, 8],
      [10, 15],
      [5, 8],
    ],
    notice:
      "melloway’s chosen route, using the Pitt Street Sneaker Laundry and Level 1 Westfield Chubby Cubby branches. Times, drink allowances and walking legs are estimates, not live pedestrian routing or a verified shortest path. Outta and Sneaker Laundry hours are directory reports; Sunday hours for the Pitt Street café are unconfirmed. Check cafés for holidays and changes.",
    stops: [
      cafe(
        "outta",
        "Outta Coffee",
        "17 Valentine St, Haymarket NSW 2000",
        -33.8818,
        151.2055,
        35,
        9,
        "https://www.instagram.com/outtacoffeesydney/",
        [
          [{ open: 480, close: 960 }],
          ...Array.from({ length: 5 }, () => [{ open: 420, close: 960 }]),
          [{ open: 480, close: 960 }],
        ],
        "Start near Central with a classic matcha.",
        "reported",
      ),
      cafe(
        "issho",
        "Issho Cafe",
        "Shop 3/710 George St, Haymarket NSW 2000",
        -33.879,
        151.2051,
        37,
        12,
        "https://www.siampalettegroup.com.au/issho-cafe",
        daily(480, 1410),
        "Matcha drinks and Japanese-inspired sweets.",
      ),
      cafe(
        "matchaya",
        "Matcha-Ya",
        "10 Steam Mill Lane, Haymarket NSW 2000",
        -33.8775,
        151.2026,
        30,
        12,
        "https://matchaya.com.au/",
        [
          ...daily(720, 1260).slice(0, 5),
          [{ open: 720, close: 1320 }],
          [{ open: 720, close: 1320 }],
        ],
        "Traditional matcha, soft serve or a parfait. Opens at noon.",
      ),
      cafe(
        "sneaker-pitt",
        "The Sneaker Laundry",
        "303 Pitt St, Sydney NSW 2000",
        -33.8744,
        151.2081,
        37,
        10,
        "https://thesneakerlaundry.com.au/pages/stores",
        [
          [],
          ...Array.from({ length: 5 }, () => [{ open: 420, close: 960 }]),
          [{ open: 600, close: 960 }],
        ],
        "Matcha and sneaker care at the Pitt Street café.",
        "reported",
      ),
      cafe(
        "chubby-westfield",
        "Chubby Cubby Cafe",
        "Westfield Sydney, Level 1, 188 Pitt St, Sydney NSW 2000",
        -33.87,
        151.2084,
        45,
        12,
        "https://www.westfield.com.au/sydney/store/1Vqvifj7edIDyM89dZbArG/chubby-cubby-cafe",
        [
          [{ open: 600, close: 1140 }],
          ...Array.from({ length: 3 }, () => [{ open: 570, close: 1140 }]),
          [{ open: 570, close: 1260 }],
          [{ open: 570, close: 1140 }],
          [{ open: 570, close: 1140 }],
        ],
        "Finish with matcha and Asian-inspired sweets on Level 1, near Cotton On Body.",
      ),
    ],
  },
];
// Secondary hours are explicitly labelled reported, never verified operator hours.
mellowayPicks[0].stops[0].sources.push({
  url: "https://wanderlog.com/place/details/6786116/outta-coffee",
  checkedAt,
  fields: ["reported hours"],
});
mellowayPicks[0].stops[3].sources.push({
  url: "https://www.waze.com/live-map/directions/au/nsw/sydney/the-sneaker-laundry?to=place.ChIJwXqwq72xEmsRjyVxO8QsMSU",
  checkedAt,
  fields: ["reported hours"],
});

export function pickRoute(pick, date) {
  if (!pick || !validDate(date)) return null;
  const candidates = structuredClone(pick.stops);
  const matrix = demoMatrix(candidates, "Walking");
  // These four legs are the user's estimates. Other edited connections use the
  // existing geographic estimate, never an invented live routing response.
  pick.walkingRanges.forEach((range, index) => {
    matrix[index][index + 1].minutes = range[1];
    matrix[index][index + 1].range = range;
  });
  const prefs = {
    ...defaultDraft(),
    date,
    time: pick.time,
    timeExplicit: true,
    transport: "Walking",
    duration: pick.duration,
    budget: 80,
    preferences: ["Matcha cafés"],
    idea: "Matcha hopping",
    ideaExplicit: true,
  };
  const plan = schedule(
    candidates,
    prefs,
    matrix,
    candidates.map((_, index) => index),
  );
  if (!plan) return null;
  return {
    candidates,
    matrix,
    plan: {
      ...plan,
      prefs,
      pickId: pick.id,
      title: pick.shortName,
      id: `${pick.planIdPrefix}-${date.replaceAll("-", "")}0001`,
      notice: pick.notice,
      pickNotice: pick.notice,
      routeNotice: "Walking · estimated",
      createdAt: new Date().toISOString(),
    },
  };
}

export function nextPickDate(pick, from = sydneyToday()) {
  for (let offset = 0; offset < 14; offset++) {
    const date = offsetDate(from, offset);
    if (pickRoute(pick, date)) return date;
  }
  return from;
}

export function matchingPicks(query = "") {
  const text = query.trim().replace(/^@/, "").toLowerCase();
  return mellowayPicks.filter((pick) =>
    [
      pick.name,
      pick.author,
      pick.area,
      ...pick.stops.flatMap((stop) => [stop.name, stop.address]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(text),
  );
}
