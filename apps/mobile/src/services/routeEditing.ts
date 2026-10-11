import { demoMatrix, venues, selectVenues, type GenerationBundle, type Itinerary, type Preferences, type Candidate } from '@melloway/domain';
import { mobileConfig } from './config';
import { createGoogleProvider } from './api';

export async function prepareEdit(current: GenerationBundle, prefs: Preferences, expand = false) {
  const config = mobileConfig();
  const provider = config.mode === 'live' ? createGoogleProvider(config.apiUrl!) : null;
  const known = current.candidates.length ? current.candidates : current.plan!.stops.map(s => ({ ...s, score: 0 }));
  let candidates: Candidate[] = [...known];
  if (expand && current.plan!.stops.every(s => s.source === 'demo')) candidates = [...new Map([...venues.map(v => ({ ...v, score: 0 })), ...known].map(v => [v.id, v])).values()];
  if (expand && provider) {
    const discovered = await provider.venues(prefs);
    candidates = [...new Map([...discovered.map(v => ({ ...v, score: 0 })), ...known].map(v => [v.id, v])).values()];
  }
  // Keep every selected stop; fill the remaining bounded matrix with nearby,
  // affordable matches rather than suggestions from all of Sydney.
  const selected = current.plan!.stops.map(stop => ({ ...stop, score: known.find(v => v.id === stop.id)?.score || 0 }));
  candidates = [...selected, ...selectVenues(candidates, prefs).filter(v => !selected.some(s => s.id === v.id))].slice(0, 14);
  let matrix = demoMatrix(candidates, prefs.transport);
  let notice = current.notice;
  if (provider && prefs.transport !== 'Not selected' && candidates.some(c => c.source === 'google')) {
    try { matrix = await provider.matrix(candidates, prefs); }
    catch { notice += ' Travel uses geographic estimates.'; }
  }
  return { candidates, matrix, notice };
}

export function reasonableOrder(plan: { stops: Itinerary['stops'] }) {
  return plan.stops.every(s => s.arrivalOverride != null || !s.tags.includes('Dinner') || s.tags.includes('Brunch') || s.arrival % 1440 >= 17 * 60);
}
