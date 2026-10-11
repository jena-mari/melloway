import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TikTokMapPlace, TikTokPlacesResponse } from '@melloway/domain';
import { readTikTokCatalogue } from './tiktokPlaceCatalogue.ts';
import { fetchPlacePoint, placeMapsUri, type GooglePlacePoint } from './tiktokPlaceMatching.ts';
import { selectGoogleMapsBrowserKey } from './events.ts';
import { renderVenueMap } from './eventMap.ts';

export function createTikTokPlacesHandler(options: { filePath?: string; fetcher?: typeof fetch } = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      const catalogue = await readTikTokCatalogue(options.filePath);
      const saved = catalogue.places.slice(-10);
      const savedPosts = new Set(catalogue.places.map(place => place.postId));
      const configured = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
      const places: TikTokMapPlace[] = await Promise.all(saved.map(async (record, index) => {
        let location: GooglePlacePoint | null = null;
        if (configured) {
          try { location = await fetchPlacePoint(record.placeId, options.fetcher); }
          catch { /* Keep the source link visible; never invent a failed location. */ }
        }
        return { ...record, label: String.fromCharCode(65 + index), address: location?.address ?? null,
          latitude: location?.latitude ?? null, longitude: location?.longitude ?? null,
          mapsUri: placeMapsUri(record.placeId, record.name) };
      }));
      const data: TikTokPlacesResponse = { places,
        mapAvailable: configured && Boolean(selectGoogleMapsBrowserKey()),
        missingCoordinates: places.filter(place => place.latitude === null).length,
        unmatchedCount: new Set(catalogue.runs.flatMap(run => run.unmatched)
          .filter(entry => !savedPosts.has(entry.candidate.postId)).map(entry => entry.candidate.postId)).size };
      if (req.url?.split('?')[0] === '/api/tiktok-places') return json(200, data);
      if (!data.mapAvailable) return json(503, { error: 'Google Places and the Google Maps preview key must be configured.' });
      const points = places.filter(place => place.latitude !== null && place.longitude !== null).map(place => ({
        label: place.label, name: place.name, address: place.address,
        latitude: place.latitude!, longitude: place.longitude!, eventIds: [place.placeId],
      }));
      if (!points.length) return json(404, { error: 'No matched café locations are available yet.' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(renderVenueMap(points, selectGoogleMapsBrowserKey()!, 'tiktok'));
    } catch { json(502, { error: 'Saved TikTok places could not be loaded.' }); }
  };
}
