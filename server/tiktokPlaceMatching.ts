import type { TikTokPlaceSuggestion } from '@melloway/domain';

export interface GooglePlacePoint {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}
export type PlaceMatch = { status: 'matched'; place: GooglePlacePoint }
  | { status: 'unmatched'; reason: 'no_clear_match' | 'ambiguous' };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nameKey = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '');
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export const validPlaceId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,300}$/.test(value);
export const inSydney = (latitude: unknown, longitude: unknown): boolean => typeof latitude === 'number'
  && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= -34.3 && latitude <= -33.3 && longitude >= 150.5 && longitude <= 151.6;
export const placeMapsUri = (placeId: string, name: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;

function point(value: unknown): GooglePlacePoint | null {
  if (!object(value) || !validPlaceId(value.id) || !object(value.displayName) || !text(value.displayName.text)
    || !text(value.formattedAddress) || !object(value.location)
    || !inSydney(value.location.latitude, value.location.longitude) || value.businessStatus !== 'OPERATIONAL') return null;
  return { placeId: value.id, name: value.displayName.text, address: value.formattedAddress,
    latitude: Number(value.location.latitude), longitude: Number(value.location.longitude) };
}

/** No nearest-result fallback: require name, suburb, AU/NSW address and one unique location. */
export function matchPlaceResponse(candidate: Pick<TikTokPlaceSuggestion, 'name' | 'suburb'>, payload: unknown): PlaceMatch {
  if (!object(payload) || (payload.places !== undefined && !Array.isArray(payload.places))) throw new Error('Invalid Google Places response.');
  const matches = new Map<string, GooglePlacePoint>();
  for (const raw of (payload.places ?? []) as unknown[]) {
    const place = point(raw);
    if (!place || !object(raw) || nameKey(place.name) !== nameKey(candidate.name) || !Array.isArray(raw.addressComponents)) continue;
    const components = raw.addressComponents.filter(object);
    const component = (type: string, expected: string) => components.some(entry => Array.isArray(entry.types)
      && entry.types.includes(type) && [entry.longText, entry.shortText].some(value => typeof value === 'string' && nameKey(value) === nameKey(expected)));
    const suburb = ['locality', 'sublocality', 'sublocality_level_1'].some(type => component(type, candidate.suburb));
    if (!suburb || !component('country', 'AU') || !component('administrative_area_level_1', 'NSW')) continue;
    if (!Array.isArray(raw.types) || !raw.types.some(type => ['cafe', 'coffee_shop', 'bakery', 'restaurant'].includes(String(type)))) continue;
    matches.set(place.placeId, place);
  }
  if (matches.size > 1) return { status: 'unmatched', reason: 'ambiguous' };
  const matched = matches.values().next().value;
  return matched ? { status: 'matched', place: matched } : { status: 'unmatched', reason: 'no_clear_match' };
}

async function googleJson(url: string, body: unknown, mask: string, fetcher: typeof fetch): Promise<unknown> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error('Set server-side GOOGLE_MAPS_API_KEY with Places API (New) enabled.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error('Google Places location lookup failed.')); controller.abort(); }, 15_000);
  });
  try {
    const operation = (async () => {
      const response = await fetcher(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      if (!response.ok) throw new Error(`Google Places returned HTTP ${response.status}.`);
      try { return await response.json() as unknown; } catch { throw new Error('Invalid Google Places response.'); }
    })();
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof Error && /^Google Places returned HTTP \d{3}\.$/.test(error.message)) throw error;
    throw new Error('Google Places location lookup failed.');
  } finally { clearTimeout(timer!); controller.abort(); }
}

export async function matchTikTokPlace(candidate: TikTokPlaceSuggestion, fetcher: typeof fetch = fetch): Promise<PlaceMatch> {
  const payload = await googleJson('https://places.googleapis.com/v1/places:searchText', {
    textQuery: `${candidate.name} ${candidate.suburb} Sydney NSW Australia`, pageSize: 5, regionCode: 'AU', languageCode: 'en',
    locationBias: { rectangle: { low: { latitude: -34.3, longitude: 150.5 }, high: { latitude: -33.3, longitude: 151.6 } } },
  }, 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.businessStatus,places.types', fetcher);
  return matchPlaceResponse(candidate, payload);
}

/** Google display content is fetched on demand rather than persisted into the catalogue. */
export async function fetchPlacePoint(placeId: string, fetcher: typeof fetch = fetch): Promise<GooglePlacePoint | null> {
  if (!validPlaceId(placeId)) throw new Error('Invalid Google Place ID.');
  const result = point(await googleJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, undefined,
    'id,displayName,formattedAddress,location,businessStatus', fetcher));
  return result?.placeId === placeId ? result : null;
}
