import { sameBusiness } from './discoveryPool.ts';

export const RECENT_RECOMMENDATIONS_KEY = 'melloway.recentRecommendations.v1';
export const RECENT_PLAN_LIMIT = 5;
const identity = venue => ({ id: venue.id, name: venue.name, address: venue.address,
  area: venue.area, lat: venue.lat, lng: venue.lng });
const validIdentity = venue => venue && ['id', 'name', 'address'].every(key =>
  typeof venue[key] === 'string' && venue[key].length > 0) &&
  Number.isFinite(venue.lat) && Number.isFinite(venue.lng);
const clean = plans => (Array.isArray(plans) ? plans : []).slice(0, RECENT_PLAN_LIMIT)
  .map(plan => ({ stops: (Array.isArray(plan?.stops) ? plan.stops : []).filter(validIdentity).slice(0, 14).map(identity) }))
  .filter(plan => plan.stops.length);

// Bounded, device-local identities only: no notes, reviews or personal answers.
// Injectable storage keeps provider tests isolated and entirely offline.
export function createRecommendationHistory({ storage = () => null, initialPlans = () => [] } = {}) {
  let memory = [];
  return {
    read() {
      try {
        const value = storage()?.getItem(RECENT_RECOMMENDATIONS_KEY);
        if (value) memory = clean(JSON.parse(value));
        else if (!memory.length) memory = clean(initialPlans());
      } catch { /* Storage may be unavailable; retain this session's memory. */ }
      return clean(memory);
    },
    record(plan) {
      if (!clean([plan]).length) return;
      memory = clean([plan, ...this.read()]);
      try { storage()?.setItem(RECENT_RECOMMENDATIONS_KEY, JSON.stringify(memory)); }
      catch { /* Storage must never prevent a feasible recommendation. */ }
    },
  };
}

export function recentPlansWithPrevious(plans, previous) {
  const recent = clean(plans);
  if (previous?.stops?.length && !recent.some(plan => plan.stops.length === previous.stops.length &&
    plan.stops.every(venue => previous.stops.some(stop => sameBusiness(venue, stop)))))
    recent.unshift(...clean([previous]));
  return recent.slice(0, RECENT_PLAN_LIMIT);
}

export function recentRecommendationCount(venue, plans = []) {
  return clean(plans).filter(plan => plan.stops.some(stop => sameBusiness(venue, stop))).length;
}
