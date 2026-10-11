import { sameBusiness } from "../engine/discoveryPool.ts";

interface VenueIdentity {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source?: string;
  area?: string;
}

// Public previews manually attached during the MATCHA-YA walkthrough and the
// requested Pick population on 2026-10-12. Opened post captions/locations identify
// these venues; video content remains third-party. Private research stays separate.
const attachedPosts: { venue: VenueIdentity; links: string[] }[] = [{
  venue: {
    id: "sydney-matchaya", name: "MATCHA-YA",
    address: "NW.05, 10 Steam Mill Lane, Haymarket NSW 2000",
    lat: -33.8778, lng: 151.2018,
  },
  links: ["https://www.tiktok.com/@ginoshumans/video/7461396447448141057"],
}, {
  venue: {
    id: "pick-matcha-chubby-westfield", name: "Chubby Cubby Café",
    address: "Level 1, Westfield Sydney, 188 Pitt Street, Sydney NSW 2000 · near Cotton On Body",
    lat: -33.87011, lng: 151.20893,
  },
  links: ["https://www.tiktok.com/@chubbycubbycafe/video/7665554939350945042"],
}, {
  venue: {
    id: "pick-ace-sydney-photobooth", name: "Ace Hotel Sydney Photobooth",
    address: "47–53 Wentworth Avenue, Sydney NSW 2000",
    lat: -33.878801, lng: 151.2099833,
  },
  links: ["https://www.tiktok.com/@smashdsyd/video/7510921227310042375"],
}, {
  venue: {
    id: "sydney-glebe-markets", name: "Glebe Markets",
    address: "Glebe Public School, 46–56 Glebe Point Road, Glebe NSW 2037",
    lat: -33.88346, lng: 151.19116,
  },
  links: ["https://www.tiktok.com/@mikaelalouisee/video/7694450128869920022"],
}, {
  venue: {
    id: "pick-birdcage-bank-hotel", name: "Birdcage at The Bank Hotel",
    address: "Waywards Ballroom, The Bank Hotel, 324 King Street, Newtown NSW 2042",
    lat: -33.8974865, lng: 151.1792614,
  },
  // Archival DJ event post; it is not a current event listing.
  links: ["https://www.tiktok.com/@djkuyahennessy/video/7366481329732554002"],
}, {
  venue: {
    id: "pick-caterpillar-club", name: "The Caterpillar Club",
    address: "92 Pitt Street, Sydney NSW 2000",
    lat: -33.8672489, lng: 151.2086816,
  },
  links: ["https://www.tiktok.com/@sydneyguide/video/7664863755632725266"],
}, {
  venue: {
    id: "pick-joji-sydney", name: "JŌJI Sydney",
    address: "Level 5, 388 George Street, Sydney NSW 2000",
    lat: -33.8683961, lng: 151.2074048,
  },
  links: ["https://www.tiktok.com/@urbanlistsyd/video/7617763773952036116"],
}, {
  venue: {
    id: "pick-o3-newtown", name: "O3 Space Newtown",
    address: "32–38 King Street, Newtown NSW 2042",
    lat: -33.8927518, lng: 151.1866322,
  },
  links: ["https://www.tiktok.com/@anniesbucketlist/video/7668959632710192404"],
}, {
  venue: {
    id: "pick-old-school-kafey", name: "Old School Kafey",
    address: "459 Pitt Street, Haymarket NSW 2000",
    lat: -33.87989, lng: 151.20677,
  },
  links: ["https://www.tiktok.com/@oldschoolkafey/video/7481219587644640519"],
}, {
  venue: {
    id: "pick-observatory-hill-park", name: "Observatory Hill Park",
    address: "Upper Fort Street, Millers Point NSW 2000",
    lat: -33.85897, lng: 151.20482,
  },
  links: ["https://www.tiktok.com/@sydneyguide/video/7668967083782196498"],
}, {
  venue: {
    id: "pick-mamuki-glebe", name: "MaMUKI Bake Bar — Glebe",
    address: "16 Glebe Point Road, Glebe NSW 2037",
    lat: -33.88402959280173, lng: 151.1922248067457,
  },
  links: ["https://www.tiktok.com/@mamuki.b/video/7671508167867567367"],
}];

export function venuePostLinks(venue: VenueIdentity): string[] {
  if (venue.source === "demo") return [];
  return [...new Set(attachedPosts
    .filter(record => sameBusiness(record.venue, venue))
    .flatMap(record => record.links))];
}
