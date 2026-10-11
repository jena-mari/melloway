import { prepareRouteEdit } from './discovery.js';
import { addStop } from '../utils/planner.js';
import { sameBusiness } from '../engine/discoveryPool.ts';
import { curatedVenuesForDate } from '../data/sydneyVenues.js';

export async function addDiscoveredPlace(current, selected, { signal } = {}) {
  const plan = current?.plan;
  if (!plan) throw new Error('Make a plan first to fit this place into your day.');
  if (plan.stops.some(stop => sameBusiness(stop, selected))) throw new Error('This place is already in your day.');
  const known = [...(current.candidates || []), ...curatedVenuesForDate(plan.prefs.date)]
    .find(venue => sameBusiness(venue, selected));
  const venue = known || selected;
  if (!Number.isFinite(venue.cost) || venue.cost < 0 || !Number.isFinite(venue.mins))
    throw new Error('Save this spot for later: its price or visit length needs confirming first.');
  if (!venue.weeklyHours && !venue.hours)
    throw new Error('Save this spot for later: its opening hours need confirming first.');
  const options = await prepareRouteEdit({ ...plan, stops: [...plan.stops, venue] }, { signal });
  signal?.throwIfAborted();
  const next = addStop(plan, venue, options.candidates, options.matrix);
  if (!next) throw new Error('This spot doesn’t fit your current time or budget. Save it, or edit your day first.');
  // Editing a route keeps its identity, start state and existing arrival overrides.
  return { ...current, ...options, plan: { ...plan, ...next, notice: options.notice } };
}
