import { sydneyToday } from "../utils/date.js";
export { sydneyToday } from "../utils/date.js";
export const areas = {
  "Anywhere in Sydney": { lat: -33.88, lng: 151.2, r: 30 },
  "Sydney CBD": { lat: -33.872, lng: 151.208, r: 2.5 },
  Newtown: { lat: -33.8965, lng: 151.1794, r: 2 },
  "Surry Hills": { lat: -33.8847, lng: 151.211, r: 2 },
  "Inner West": { lat: -33.8965, lng: 151.1794, r: 5 },
  "Eastern Suburbs": { lat: -33.8841, lng: 151.2273, r: 6 },
};
export const categories = {
  "typa hangout": [
    "Flea markets",
    "Thrifting",
    "Vintage stores",
    "Matcha cafés",
    "Coffee shops",
    "Jazz bars",
    "Live music",
    "Beaches",
    "Bookshops",
    "Art galleries",
  ],
  "typa food": [
    "Asian food",
    "Italian food",
    "Café food",
    "Brunch",
    "Dinner",
    "Desserts",
    "Street food",
  ],
  "typa activity": [
    "Escape rooms",
    "Music festivals",
    "Arcades",
    "Museums",
    "Photo spots",
    "Picnics",
    "Shopping",
    "Scenic walks",
  ],
};
export const defaultDraft = () => ({
  mode: "date",
  name: "",
  age: 24,
  gender: "",
  companion: "my person",
  partner: "",
  area: "Sydney CBD",
  budget: 80,
  date: sydneyToday(),
  time: "11:00",
  transport: "Walking",
  duration: 5,
  preferences: [],
});
