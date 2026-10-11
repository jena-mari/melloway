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

// This is the public reel manually attached during the MATCHA-YA walkthrough.
// Browser visits can share this association without reading or approving the
// private discovery queue, or changing recommendation scores.
const attachedPosts: { venue: VenueIdentity; links: string[] }[] = [{
  venue: {
    id: "sydney-matchaya", name: "MATCHA-YA",
    address: "NW.05, 10 Steam Mill Lane, Haymarket NSW 2000",
    lat: -33.8778, lng: 151.2018,
  },
  links: ["https://www.tiktok.com/@ginoshumans/video/7461396447448141057"],
}];

export function venuePostLinks(venue: VenueIdentity): string[] {
  if (venue.source === "demo") return [];
  return [...new Set(attachedPosts
    .filter(record => sameBusiness(record.venue, venue))
    .flatMap(record => record.links))];
}
