export interface SydneyEvent {
  id: string;
  name: string;
  startDate: string;
  startTime: string | null;
  startDateTime: string | null;
  timezone: string | null;
  venue: { name: string | null; address: string | null; latitude: number | null; longitude: number | null } | null;
  category: string | null;
  url: string | null;
  priceRanges: { min: number | null; max: number | null; currency: string | null }[] | null;
}

export interface EventMapPoint {
  label: string;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  eventIds: string[];
}
export interface EventMapResponse {
  events: SydneyEvent[];
  points: EventMapPoint[];
  missingCoordinates: number;
  mapAvailable: boolean;
}

/** Group shared coordinates without moving pins or dropping events at that venue. */
export function eventMapPoints(events: SydneyEvent[]): EventMapPoint[] {
  const points: EventMapPoint[] = [];
  for (const event of events) {
    const venue = event.venue;
    if (!venue || typeof venue.latitude !== 'number' || typeof venue.longitude !== 'number'
      || !Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)
      || Math.abs(venue.latitude) > 90 || Math.abs(venue.longitude) > 180) continue;
    const existing = points.find(p => p.latitude === venue.latitude && p.longitude === venue.longitude);
    if (existing) existing.eventIds.push(event.id);
    else points.push({ label: String.fromCharCode(65 + points.length), name: venue.name, address: venue.address,
      latitude: venue.latitude, longitude: venue.longitude, eventIds: [event.id] });
  }
  return points;
}
