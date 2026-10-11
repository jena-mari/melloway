import { venues } from './venues.ts';
import { demoMatrix, optimise, selectVenues } from './planner.ts';
import type { DiscoveryProvider, GenerationBundle, Itinerary, Preferences } from './types.ts';

export interface GenerationOptions {
  provider?: DiscoveryProvider;
  seed?: number;
  previous?: Itinerary | null;
  onStage?: (stage: string) => void;
  createId: () => string;
  now?: () => Date;
}
/** Platform-independent orchestration, with providers and identity injected. */
export async function generateItinerary(prefs: Preferences, options: GenerationOptions): Promise<GenerationBundle> {
  const { provider, seed = 0, previous, onStage = () => {}, createId, now = () => new Date() } = options;
  onStage('finding spots that fit ur vibe…');
  let all = venues;
  let notice = 'Demo venues, sample hours and estimated prices. Mood photos are illustrative.';
  if (provider) {
    try {
      const live = await provider.venues(prefs);
      if (live.length >= 3) {
        all = live;
        notice = 'Google Places data. Costs and visit durations are planning allowances; confirm availability before booking.';
      }
    } catch { /* Preserve offline demo fallback. */ }
  }
  const candidates = selectVenues(all, prefs, seed);
  onStage('checking budget, hours & distance…');
  let matrix = demoMatrix(candidates, prefs.transport);
  if (provider && all !== venues && prefs.transport !== 'Not selected') {
    try { matrix = await provider.matrix(candidates, prefs); }
    catch { notice += ' Routing unavailable: travel uses rough geographic estimates.'; }
  }
  onStage('exploring the best order for ur stops…');
  let plan = optimise(candidates, prefs, matrix, { excludeSignature: previous?.stops.map(v => v.id).sort().join('|') });
  if (!plan && previous) plan = optimise(candidates, prefs, matrix);
  return {
    plan: plan ? { ...plan, id: createId(), prefs, notice, createdAt: now().toISOString() } : null,
    candidates, matrix, notice,
  };
}
