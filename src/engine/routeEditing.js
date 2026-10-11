import { reorderSelected } from '../../packages/domain/src/routeOrder.ts';
import { editRoute } from '../utils/planner.js';
import { timeSuitable } from './preferences.js';

export function reorderRoute(plan, candidates, matrix, mode) {
  return reorderSelected(plan.stops, stops => editRoute(stops, plan.prefs, candidates, matrix), mode,
    next => next.stops.every(stop => stop.arrivalOverride != null || (timeSuitable(stop, stop.arrival) &&
      (!stop.tags.includes('Dinner') || stop.tags.includes('Brunch') || stop.arrival % 1440 >= 1020))));
}
