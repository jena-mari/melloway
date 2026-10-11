interface DiscoveryVenue {
  id: string;
  name: string;
  address: string;
  area?: string;
  lat: number;
  lng: number;
}

function words(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function businessName(venue: DiscoveryVenue): string {
  let name = words(venue.name).replace(/^(the|books) /, "");
  // Providers sometimes append the suburb to the operator's business name.
  const localities = venue.address.split(",").slice(1)
    .map((part) => part.match(/^\s*(.*?)\s+(?:NSW|New South Wales)\s+\d{4}/i)?.[1])
    .filter((part): part is string => Boolean(part)).map(words);
  const suffixes = [words(venue.area || ""), ...localities, "sydney"];
  for (let pass = 0; pass < 2; pass++) {
    for (const suffix of suffixes)
      if (suffix && name.endsWith(` ${suffix}`))
        name = name.slice(0, -suffix.length - 1);
  }
  return name.replace(/ /g, "");
}

function streetLine(address: string): string {
  const parts = address.split(",");
  const street = /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|highway|hwy)\b/i;
  return parts.find((part) => /\d/.test(part) && street.test(part)) ||
    parts.find((part) => street.test(part)) || parts[0];
}

function streetAddress(address: string): string {
  return words(streetLine(address))
    .replace(/\bstreet\b/g, "st").replace(/\broad\b/g, "rd")
    .replace(/\bavenue\b/g, "ave").replace(/\blane\b/g, "ln")
    .replace(/\bdrive\b/g, "dr").replace(/\bhighway\b/g, "hwy");
}

function streetNumbers(address: string): [number, number] | null {
  const match = streetLine(address).match(/^\s*(\d+)\s*(?:[-–—]\s*(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] || match[1])] : null;
}

function distanceMeters(a: DiscoveryVenue, b: DiscoveryVenue): number {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) *
    Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function sameBusiness(a: DiscoveryVenue, b: DiscoveryVenue): boolean {
  if (a.id === b.id) return true;
  const name = businessName(a);
  if (!name || name !== businessName(b)) return false;
  const distance = distanceMeters(a, b);
  const address = streetAddress(a.address);
  if (address && address === streetAddress(b.address)) return distance <= 300;
  const an = streetNumbers(a.address), bn = streetNumbers(b.address);
  // Nearby branches at different street numbers are distinct businesses.
  if (an && bn && (an[1] < bn[0] || bn[1] < an[0])) return false;
  return distance <= 150;
}

export function mergeDiscoveryPool<T extends DiscoveryVenue>(
  curated: readonly T[],
  discovered: readonly T[],
): T[] {
  // Keep every editorial record intact, including unknown hours/price evidence.
  // Google contributes additional businesses, never replacement facts or tags.
  const pool = [...curated];
  for (const venue of discovered)
    if (!pool.some((existing) => sameBusiness(existing, venue))) pool.push(venue);
  return pool;
}
