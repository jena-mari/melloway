import { sameBusiness } from "../engine/discoveryPool.ts";

export interface SearchablePlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source?: string;
  area?: string;
  category?: string;
  description?: string;
  reason?: string;
  tags?: readonly string[];
  vibes?: readonly string[];
}

export interface PlaceSearchEntry {
  venue: SearchablePlace;
  href: string;
}

function words(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function fields(venue: SearchablePlace): string[] {
  return [venue.name, venue.address, venue.area, venue.category,
    venue.description, venue.reason, ...(venue.tags || []), ...(venue.vibes || [])]
    .filter((value): value is string => Boolean(value)).map(words);
}

// The first entry supplies the existing detail route. Duplicate catalogue
// entries contribute search terms without replacing any venue facts.
export function searchPlaces<T extends PlaceSearchEntry>(
  entries: readonly T[], query: string,
): T[] {
  const tokens = words(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const places: { entry: T; fields: string[] }[] = [];
  for (const entry of entries) {
    if (entry.venue.source !== "curated") continue;
    const existing = places.find(({ entry: first }) =>
      sameBusiness(first.venue, entry.venue));
    if (existing) existing.fields.push(...fields(entry.venue));
    else places.push({ entry, fields: fields(entry.venue) });
  }
  return places.filter(({ fields: values }) => {
    const searchable = [...values, ...values.map(value => value.replace(/ /g, ""))];
    return tokens.every(token => searchable.some(value => value.includes(token)));
  }).map(({ entry }) => entry);
}
