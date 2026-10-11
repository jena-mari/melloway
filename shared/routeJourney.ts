export interface RoutePoint { lat: number; lng: number }
export interface TransitStop { name: string; location?: RoutePoint }
export type JourneyStep = { mode: 'walk'; minutes?: number } | {
  mode: 'transit'; minutes?: number; line?: string; vehicle?: string; headsign?: string;
  departureStop: TransitStop; arrivalStop: TransitStop;
  departureTime?: string; arrivalTime?: string; stopCount?: number;
};
export interface RouteJourney {
  departureTime: string;
  durationMinutes?: number;
  steps: JourneyStep[];
}
export interface RouteLeg {
  fromIndex: number; toIndex: number; path: RoutePoint[]; journey?: RouteJourney;
}

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const minutes = (value: unknown) => value === undefined || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2880;
const timestamp = (value: unknown) => typeof value === 'string' && value.length <= 40
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
function stop(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const entry = value as TransitStop;
  return text(entry.name) && (entry.location === undefined || !!entry.location
    && Number.isFinite(entry.location.lat) && Number.isFinite(entry.location.lng)
    && Math.abs(entry.location.lat) <= 90 && Math.abs(entry.location.lng) <= 180);
}

/** Optional transport details must never make otherwise valid map geometry unusable. */
export function isRouteJourney(value: unknown): value is RouteJourney {
  if (!value || typeof value !== 'object') return false;
  const journey = value as RouteJourney;
  return timestamp(journey.departureTime) && minutes(journey.durationMinutes)
    && Array.isArray(journey.steps) && journey.steps.length > 0 && journey.steps.length <= 80
    && journey.steps.every(step => {
      if (!step || !minutes(step.minutes)) return false;
      if (step.mode === 'walk') return true;
      return step.mode === 'transit' && stop(step.departureStop) && stop(step.arrivalStop)
        && [step.line, step.vehicle, step.headsign].every(value => value === undefined || text(value))
        && [step.departureTime, step.arrivalTime].every(value => value === undefined || timestamp(value))
        && (step.stopCount === undefined || Number.isInteger(step.stopCount) && step.stopCount >= 0 && step.stopCount <= 1000);
    });
}
