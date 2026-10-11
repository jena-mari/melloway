import { sydneyToday } from "../utils/date.js";

// Hand-curated official listings, checked 11 October 2026. These are organiser
// listings, not scraped Instagram posts. Keep source links and photo credits.
export const sydneyEvents = [
  {
    id: "sydney:surplus-2026", source: "organiser", theme: "pink",
    title: "SURPLUS 2026", host: "SURPLUS", handle: "surplussydney", initials: "S",
    type: "festivals", area: "Darlinghurst", startDate: "2026-10-16", endDate: "2026-10-18",
    when: "16–18 Oct 2026", entry: "Mostly free · some events ticketed",
    text: "Vintage, music, food and pop-ups across Darlinghurst.",
    details: "Check the programme for individual venues, times and tickets.",
    url: "https://surplus.sydney/", instagramUrl: "https://www.instagram.com/surplussydney/",
    image: "https://surplus.sydney/cdn/shop/files/SURPLUS_LANDER_93cb9511-be14-41da-b07c-328f8261a67c.jpg?v=1781682876&width=600",
    imageCredit: "Artwork: SURPLUS", imageAlt: "SURPLUS festival collage",
  },
  {
    id: "sydney:sculpture-bondi-2026", source: "organiser", theme: "blue",
    title: "Sculpture by the Sea", host: "Sculpture by the Sea", handle: "sculpturebythesea", initials: "S",
    type: "exhibitions", area: "Bondi → Tamarama", startDate: "2026-10-16", endDate: "2026-11-02",
    when: "16 Oct–2 Nov 2026", entry: "Free · voluntary contributions welcome",
    text: "An outdoor sculpture exhibition along the coastal walk.",
    details: "Check the organiser’s guide for access and exhibition updates.",
    url: "https://sculpturebythesea.com/bondi/", instagramUrl: "https://www.instagram.com/sculpturebythesea/",
    image: "https://sculpturebythesea.com/wp-content/uploads/2025/10/AprilPineWA_England_Sway_SxSBondi2025_CharlotteCurd_-21-1.jpg",
    imageCredit: "2025 edition · April Pine, Sway · Photo: Charlotte Curd",
    imageAlt: "April Pine’s Sway at Sculpture by the Sea, Bondi 2025",
  },
  {
    id: "sydney:parramatta-lanes-2026", source: "organiser", theme: "green",
    title: "Parramatta Lanes", host: "AT Parramatta", handle: "atparramatta", initials: "P",
    type: "festivals", area: "Parramatta CBD", startDate: "2026-10-21", endDate: "2026-10-24",
    when: "21–24 Oct 2026", entry: "Free entry · food and drinks extra",
    text: "Four nights of street food, live music and art.",
    details: "Some free activities need bookings. Check the programme before heading out.",
    url: "https://atparramatta.com/lanes", instagramUrl: "https://www.instagram.com/atparramatta/",
    image: "https://atparramatta.com/sites/discoverparra/files/lanes26_lanes_website_home_cat_524x617-2_eats.webp",
    imageCredit: "Image: City of Parramatta", imageAlt: "Street food at Parramatta Lanes",
  },
];

export function upcomingSydneyEvents(today = sydneyToday()) {
  return sydneyEvents.filter(event => event.endDate >= today);
}
