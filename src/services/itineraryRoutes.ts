export interface RoutePoint { lat: number; lng: number }
export interface RoutePaths {
  transport: 'Walking' | 'Public transport' | 'Driving';
  paths: { fromIndex: number; toIndex: number; path: RoutePoint[] }[];
  missingLegs: number;
  warnings: string[];
}
interface Stop extends RoutePoint { name: string; arrival?: number; mins?: number }
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export async function requestItineraryRoutes(stops: Stop[], transport: RoutePaths['transport'],
  date: string | undefined, time: string | undefined, signal: AbortSignal): Promise<RoutePaths> {
  const response = await fetch(`${base}/api/itinerary-routes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ transport, date, time, stops: stops.map(({ name, lat, lng, arrival, mins }) => ({
      name, lat, lng, ...(Number.isFinite(arrival) && Number.isFinite(mins) ? { departureMinutes: arrival! + mins! } : {}),
    })) }),
  });
  if (!response.ok) throw new Error('Route lines are unavailable.');
  const data = await response.json() as RoutePaths;
  const seen = new Set<number>();
  if (!data || data.transport !== transport || !Array.isArray(data.paths) || data.paths.length > stops.length - 1
    || !Number.isInteger(data.missingLegs) || data.missingLegs < 0 || data.missingLegs > stops.length - 1
    || !Array.isArray(data.warnings) || data.warnings.some(warning => typeof warning !== 'string' || warning.length > 1000)
    || data.paths.some(leg => {
      if (!Number.isInteger(leg.fromIndex) || leg.fromIndex < 0 || leg.toIndex !== leg.fromIndex + 1
        || leg.toIndex >= stops.length || seen.has(leg.fromIndex)) return true;
      seen.add(leg.fromIndex);
      return !Array.isArray(leg.path) || leg.path.length < 2 || leg.path.length > 10_000
        || leg.path.some(point => !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)
          || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180);
    })) throw new Error('Route lines are unavailable.');
  return data;
}
