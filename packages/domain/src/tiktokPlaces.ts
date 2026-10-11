/** A search suggestion is unverified; Google matching establishes a location, not video content. */
export interface TikTokPlaceSuggestion {
  name: string;
  suburb: string;
  sourceUrl: string;
  normalizedUrl: string;
  postId: string;
  evidence: string;
}

/** Persist only the Google Place ID. Google names/addresses/coordinates are fetched for display. */
export interface SavedTikTokPlace extends TikTokPlaceSuggestion {
  placeId: string;
  discoveredAt: string;
  reviewStatus: 'pending';
}

export interface TikTokMapPlace extends SavedTikTokPlace {
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapsUri: string;
}

export interface TikTokPlacesResponse {
  places: TikTokMapPlace[];
  mapAvailable: boolean;
  missingCoordinates: number;
  unmatchedCount: number;
}
