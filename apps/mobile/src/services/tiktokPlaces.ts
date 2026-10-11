import { parseSocialMediaUrl, type TikTokPlacesResponse } from '@melloway/domain';
import { resolveConfig } from './config.ts';

export const tiktokPlacesApiOrigin = () => resolveConfig('live', process.env.EXPO_PUBLIC_API_URL).apiUrl!;
export async function fetchTikTokPlaces(origin = tiktokPlacesApiOrigin(), fetcher: typeof fetch = fetch): Promise<TikTokPlacesResponse> {
  const apiUrl = resolveConfig('live', origin).apiUrl!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(`${apiUrl}/api/tiktok-places`, { signal: controller.signal });
    if (!response.ok) throw new Error('TikTok places could not be loaded.');
    const data = await response.json() as TikTokPlacesResponse;
    const ids = new Set<string>();
    const posts = new Set<string>();
    if (!data || !Array.isArray(data.places) || data.places.length > 10 || typeof data.mapAvailable !== 'boolean'
      || !Number.isInteger(data.missingCoordinates) || data.missingCoordinates < 0
      || !Number.isInteger(data.unmatchedCount) || data.unmatchedCount < 0) throw new Error('Invalid TikTok place response.');
    for (const place of data.places) {
      const source = parseSocialMediaUrl(place?.sourceUrl);
      const post = parseSocialMediaUrl(place?.normalizedUrl);
      let maps: URL;
      try { maps = new URL(place?.mapsUri); } catch { throw new Error('Invalid TikTok place response.'); }
      if (!place || !/^[A-Za-z0-9_-]{1,300}$/.test(place.placeId) || ids.has(place.placeId) || posts.has(place.postId)
        || typeof place.name !== 'string' || !place.name.trim() || typeof place.suburb !== 'string' || !place.suburb.trim()
        || typeof place.evidence !== 'string' || typeof place.discoveredAt !== 'string' || !Number.isFinite(Date.parse(place.discoveredAt))
        || place.reviewStatus !== 'pending' || !/^[A-J]$/.test(place.label)
        || source?.platform !== 'tiktok' || post?.platform !== 'tiktok' || post.id !== place.postId
        || post.normalizedUrl !== place.normalizedUrl || source.normalizedUrl !== post.normalizedUrl
        || maps.protocol !== 'https:' || maps.hostname !== 'www.google.com' || maps.port || maps.username || maps.password
        || maps.pathname !== '/maps/search/' || maps.searchParams.get('query_place_id') !== place.placeId
        || (place.address !== null && typeof place.address !== 'string')
        || (place.latitude === null || place.longitude === null
          ? place.latitude !== null || place.longitude !== null
          : typeof place.latitude !== 'number' || typeof place.longitude !== 'number'
            || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
            || place.latitude < -34.3 || place.latitude > -33.3 || place.longitude < 150.5 || place.longitude > 151.6)) {
        throw new Error('Invalid TikTok place response.');
      }
      ids.add(place.placeId); posts.add(place.postId);
    }
    if (data.missingCoordinates !== data.places.filter(place => place.latitude === null).length) throw new Error('Invalid TikTok place response.');
    return data;
  } finally { clearTimeout(timer); }
}
