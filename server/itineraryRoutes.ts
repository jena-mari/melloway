import { itineraryMapPoints } from './itineraryMap.ts';
import { sydneyDate, sydneyInstant } from './eventPreferences.ts';

export interface RoutePoint { lat: number; lng: number }
export interface ItineraryRouteRequest {
  stops: { name: string; lat: number; lng: number; departureMinutes?: number }[];
  transport: 'Walking' | 'Public transport' | 'Driving';
  date: string;
  time: string;
}
export interface ItineraryRoutePaths {
  transport: ItineraryRouteRequest['transport'];
  paths: { fromIndex: number; toIndex: number; path: RoutePoint[] }[];
  missingLegs: number;
  warnings: string[];
}

export function readItineraryRouteRequest(value: unknown, now = new Date()): ItineraryRouteRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid route details.');
  const input = value as Partial<ItineraryRouteRequest>;
  itineraryMapPoints(input.stops);
  if (!['Walking', 'Public transport', 'Driving'].includes(input.transport ?? '')) throw new Error('Choose a travel method.');
  const date = input.date ?? sydneyDate(now);
  const time = input.time ?? '11:00';
  if (typeof date !== 'string' || typeof time !== 'string') throw new Error('Invalid route date or time.');
  sydneyInstant(date, time);
  if (input.stops!.some(stop => stop.departureMinutes !== undefined
    && (!Number.isFinite(stop.departureMinutes) || stop.departureMinutes < 0 || stop.departureMinutes > 2880)))
    throw new Error('Invalid stop departure time.');
  return { stops: input.stops!, transport: input.transport!, date, time };
}

function departure(request: ItineraryRouteRequest, index: number): string {
  const minutes = request.stops[index].departureMinutes;
  if (minutes === undefined) return sydneyInstant(request.date, request.time).toISOString();
  const day = new Date(`${request.date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Math.floor(minutes / 1440));
  const minute = Math.floor(minutes % 1440);
  return sydneyInstant(day.toISOString().slice(0, 10),
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`).toISOString();
}

/** Transient route shapes for display only: no storage, geocoding or stop reordering. */
export function createItineraryRoutesProvider(key: string | undefined, fetcher: typeof fetch = fetch) {
  return async (request: ItineraryRouteRequest): Promise<ItineraryRoutePaths> => {
    if (!key?.trim()) throw new Error('Google routing is not configured.');
    const legs = request.stops.slice(1).map((destination, index) => ({ origin: request.stops[index], destination, index }));
    const paths: ItineraryRoutePaths['paths'] = [];
    const warnings = new Set<string>();
    let next = 0;
    let missingLegs = 0;
    const signal = AbortSignal.timeout(10_000);
    const point = (stop: RoutePoint) => ({ location: { latLng: { latitude: stop.lat, longitude: stop.lng } } });
    await Promise.all(Array.from({ length: Math.min(3, legs.length) }, async () => {
      while (next < legs.length) {
        const { origin, destination, index } = legs[next++];
        if (origin.lat === destination.lat && origin.lng === destination.lng) continue;
        try {
          const response = await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST', signal, redirect: 'error', headers: {
              'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
              'X-Goog-FieldMask': 'routes.polyline.geoJsonLinestring,routes.warnings',
            }, body: JSON.stringify({ origin: point(origin), destination: point(destination),
              travelMode: request.transport === 'Walking' ? 'WALK' : request.transport === 'Driving' ? 'DRIVE' : 'TRANSIT',
              ...(request.transport === 'Public transport' ? { departureTime: departure(request, index) } : {}),
              polylineEncoding: 'GEO_JSON_LINESTRING', polylineQuality: 'HIGH_QUALITY',
            }),
          });
          if (!response.ok) throw new Error();
          const data = await response.json();
          const route = data?.routes?.[0];
          const line = route?.polyline?.geoJsonLinestring;
          if (line?.type !== 'LineString' || !Array.isArray(line.coordinates)
            || line.coordinates.length < 2 || line.coordinates.length > 10_000
            || line.coordinates.some((p: unknown) => !Array.isArray(p) || p.length < 2
              || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw new Error();
          paths.push({ fromIndex: index, toIndex: index + 1,
            path: line.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })) });
          if (Array.isArray(route.warnings)) for (const warning of route.warnings.slice(0, 10))
            if (typeof warning === 'string' && warning.length <= 1000) warnings.add(warning);
        } catch {
          // Never expose provider bodies, URLs or keys, and never invent a connecting line.
          missingLegs++;
        }
      }
    }));
    return { transport: request.transport, paths: paths.sort((a, b) => a.fromIndex - b.fromIndex), missingLegs, warnings: [...warnings] };
  };
}
