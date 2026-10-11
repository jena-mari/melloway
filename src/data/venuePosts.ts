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
  links: [
    "https://www.tiktok.com/@chubbycubbycafe/video/7665554939350945042",
    "https://www.tiktok.com/@ceepingupwithchiara/video/7674955017656225031",
    "https://www.tiktok.com/@aarona.notes/video/7668135651706932487",
  ],
}, {
  venue: {
    id: "pick-ace-sydney-photobooth", name: "Ace Hotel Sydney Photobooth",
    address: "47–53 Wentworth Avenue, Sydney NSW 2000",
    lat: -33.878801, lng: 151.2099833,
  },
  links: [
    "https://www.tiktok.com/@smashdsyd/video/7510921227310042375",
    "https://www.tiktok.com/@nibblenation/video/7685534435520941333",
  ],
}, {
  venue: {
    id: "sydney-glebe-markets", name: "Glebe Markets",
    address: "Glebe Public School, 46–56 Glebe Point Road, Glebe NSW 2037",
    lat: -33.88346, lng: 151.19116,
  },
  links: [
    "https://www.tiktok.com/@mikaelalouisee/video/7694450128869920022",
    "https://www.tiktok.com/@franmagiera/video/7522989743936720146",
    "https://www.tiktok.com/@bellahollamby/video/7595168919426583830",
  ],
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
  links: [
    "https://www.tiktok.com/@sydneyguide/video/7664863755632725266",
    "https://www.tiktok.com/@_isabelchen/video/7328162576527805704",
  ],
}, {
  venue: {
    id: "pick-joji-sydney", name: "JŌJI Sydney",
    address: "Level 5, 388 George Street, Sydney NSW 2000",
    lat: -33.8683961, lng: 151.2074048,
  },
  links: [
    "https://www.tiktok.com/@urbanlistsyd/video/7617763773952036116",
    "https://www.tiktok.com/@ahc.alice/video/7690441763542093078",
  ],
}, {
  venue: {
    id: "pick-o3-newtown", name: "O3 Space Newtown",
    address: "32–38 King Street, Newtown NSW 2042",
    lat: -33.8927518, lng: 151.1866322,
  },
  links: [
    "https://www.tiktok.com/@anniesbucketlist/video/7668959632710192404",
    "https://www.tiktok.com/@tataykatelyn/video/7664583698699848968",
  ],
}, {
  venue: {
    id: "pick-old-school-kafey", name: "Old School Kafey",
    address: "459 Pitt Street, Haymarket NSW 2000",
    lat: -33.87989, lng: 151.20677,
  },
  links: [
    "https://www.tiktok.com/@oldschoolkafey/video/7481219587644640519",
    "https://www.tiktok.com/@stellehungry/video/7691996991173184789",
  ],
}, {
  venue: {
    id: "pick-observatory-hill-park", name: "Observatory Hill Park",
    address: "Upper Fort Street, Millers Point NSW 2000",
    lat: -33.85897, lng: 151.20482,
  },
  links: [
    "https://www.tiktok.com/@sydneyguide/video/7668967083782196498",
    "https://www.tiktok.com/@sydneysunnies_/video/7667173207048244487",
  ],
}, {
  venue: {
    id: "pick-mamuki-glebe", name: "MaMUKI Bake Bar — Glebe",
    address: "16 Glebe Point Road, Glebe NSW 2037",
    lat: -33.88402959280173, lng: 151.1922248067457,
  },
  links: [
    "https://www.tiktok.com/@mamuki.b/video/7671508167867567367",
    "https://www.tiktok.com/@foodsfortwo/video/7604696727030877448",
  ],
}];

export function venuePostLinks(venue: VenueIdentity): string[] {
  if (venue.source === "demo") return [];
  return [...new Set(attachedPosts
    .filter(record => sameBusiness(record.venue, venue))
    .flatMap(record => record.links))];
}
