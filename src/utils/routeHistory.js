import { validPreferences, editRoute } from './planner.js';
import { normalisePlanNames } from './venueNames.js';

export const HISTORY_KEY = 'melloway.history';
export const CURRENT_KEY = 'melloway.current';
export function validPlan(plan) {
  return Boolean(plan?.id && validPreferences(plan.prefs) &&
    Array.isArray(plan.stops) && plan.stops.length >= 1 && plan.stops.length <= 14 &&
    plan.stops.every(s => typeof s.id === 'string' && typeof s.name === 'string' &&
      Array.isArray(s.tags) && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.arrival)));
}
const copy = value => JSON.parse(JSON.stringify(value));
const validInstant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const stars = value => Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;

export function cleanReview(value, plan) {
  return {
    rating: stars(value?.rating),
    text: typeof value?.text === 'string' ? value.text.trim().slice(0, 300) : '',
    stopRatings: Object.fromEntries(plan.stops.filter(s => stars(value?.stopRatings?.[s.id]))
      .map(s => [s.id, value.stopRatings[s.id]])),
  };
}

export function archiveRoute(route, completedAt = new Date().toISOString()) {
  if (!validPlan(route?.plan) || !validInstant(completedAt)) throw new Error('Invalid route');
  const plan = copy(normalisePlanNames(route.plan));
  plan.status = 'completed';
  plan.completedAt = completedAt;
  // Reviews live only in the private history record, never on cloud-saved plans.
  delete plan.review;
  return { id: plan.id, plan, completedAt, review: cleanReview(null, plan) };
}

export function readJourney(read, write) {
  const stored = read(HISTORY_KEY, []);
  const history = Array.isArray(stored) ? [...new Map(stored
    .filter(r => r?.id === r?.plan?.id && validPlan(r?.plan) && validInstant(r?.completedAt))
    .map(r => [r.id, { ...r, plan: { ...normalisePlanNames(r.plan), status: 'completed' },
      review: cleanReview(r.review, r.plan) }])).values()] : [];
  const route = read(CURRENT_KEY, null);
  if (!validPlan(route?.plan)) return { current: null, history };
  // History is the authoritative completion marker, including after a failed
  // current-key write or when an older saved/cloud copy is reopened.
  if (history.some(r => r.id === route.plan.id)) return { current: null, history };
  if (route.plan.status === 'completed') {
    const entry = archiveRoute(route, validInstant(route.plan.completedAt) ? route.plan.completedAt : undefined);
    history.unshift(entry);
    try { write(HISTORY_KEY, history); }
    catch { return { current: null, history, unpersisted: true,
      warning: 'Couldn’t archive this past date yet. Free some device storage and try again.' }; }
    return { current: null, history };
  }
  return { history, current: { ...route,
    candidates: Array.isArray(route.candidates) ? route.candidates : [],
    matrix: Array.isArray(route.matrix) ? route.matrix : [],
    plan: { ...normalisePlanNames(route.plan),
      status: route.plan.status === 'in-progress' ? 'in-progress' : 'upcoming' } } };
}

export function finishJourney(route, history, write, completedAt) {
  const existing = history.find(r => r.id === route?.plan?.id);
  const entry = existing || archiveRoute(route, completedAt);
  const next = existing ? history : [entry, ...history];
  // Commit the snapshot first. If this fails, the active route is untouched.
  write(HISTORY_KEY, next);
  try { write(CURRENT_KEY, null); } catch { /* readJourney excludes archived IDs */ }
  return { entry, history: next };
}

export function recreateRoute(entry, prefs, options, id) {
  const source = copy(entry.plan);
  const scheduled = editRoute(source.stops, prefs, options.candidates, options.matrix);
  if (!scheduled) return null;
  delete source.startedAt;
  delete source.completedAt;
  delete source.review;
  return { ...options, plan: { ...source, ...scheduled, prefs: copy(prefs), id,
    status: 'upcoming', recreatedFrom: entry.id, notice: options.notice || source.notice } };
}

// Sharing requires the existing composer and its explicit Post action. Strip
// private onboarding answers and lifecycle metadata from attached snapshots.
export function communityRouteSnapshot(plan) {
  const publicPlan = copy(plan);
  for (const key of ['review', 'startedAt', 'completedAt', 'recreatedFrom', 'status', 'intent']) delete publicPlan[key];
  for (const key of ['name', 'age', 'gender', 'partner', 'companion', 'notes', 'idea', 'ideaExplicit']) delete publicPlan.prefs[key];
  return publicPlan;
}
