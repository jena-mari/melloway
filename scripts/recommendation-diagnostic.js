// Offline only: real linked catalogue records, estimated routing, zero network.
// Run: node --experimental-strip-types scripts/recommendation-diagnostic.js
import { defaultDraft } from '../src/data/preferences.js';
import { recommendationVenuesForDate } from '../src/data/recommendationCatalog.js';
import { attachRecommendationEvidence } from '../src/engine/recommendationEvidence.js';
import { interpretPreferences, venueRoles } from '../src/engine/preferences.js';
import { bindRequestedVenues } from '../src/engine/venueIdentity.js';
import { candidateDiagnostics } from '../src/engine/filtering.js';
import { createRecommendationHistory } from '../src/engine/recommendationHistory.js';
import { generate } from '../src/services/discovery.js';

// Catch accidental provider calls rather than silently reaching a configured API.
globalThis.fetch = async () => { throw new Error('Network is disabled in this diagnostic'); };
const prefs = { ...defaultDraft(), date: '2026-10-17', transport: 'Walking' };
async function diagnose(label, input, history = createRecommendationHistory()) {
  const recentPlans = history.read();
  const result = await generate(input, 0, () => {}, null, { offline: true, recommendationHistory: history });
  const planningPrefs = result.plan?.prefs || input;
  const pool = attachRecommendationEvidence(recommendationVenuesForDate(planningPrefs.date));
  const intent = bindRequestedVenues(interpretPreferences(planningPrefs), planningPrefs, pool, venueRoles);
  const rows = candidateDiagnostics(pool, planningPrefs, intent, { recentPlans });
  const picked = new Set(result.plan?.stops.map(stop => stop.id));
  console.log(`\n${label}\nArea: ${input.area}; notes: ${input.notes || '(none)'}; previous plans: ${recentPlans.length}`);
  console.log('Route:', result.plan?.stops.map(stop => stop.name).join(' → ') || result.failure.message);
  console.log('Scores reflect estimates and existing source evidence; no ratings/reviews are invented.');
  console.table(rows.filter(row => !row.rejection).slice(0, 14).map(row => ({
    name: row.name, score: row.score.toFixed(1), tags: row.tags.join(', '),
    status: picked.has(row.id) ? 'chosen' : row.shortlisted ? 'shortlisted' : 'below shortlist',
    rejection: row.rejection || 'none',
    factors: Object.entries(row.scoreBreakdown).filter(([, value]) => value !== 0)
      .map(([key, value]) => `${key}=${value.toFixed(1)}`).join('; '),
  })));
  console.table(rows.filter(row => row.rejection).map(row => ({ name: row.name,
    score: row.score.toFixed(1), tags: row.tags.join(', '), rejection: row.rejection })));
  if (result.plan?.matchNotice) console.log(result.plan.matchNotice);
  return result;
}
await diagnose('Newtown: matcha + thrifting + indie bookshops', { ...prefs, area: 'Newtown', notes: 'matcha, thrifting and indie bookshops' });
await diagnose('Independent-bookshop idea: ownership preference is retained', {
  ...prefs, area: 'Newtown', idea: 'books-art', ideaExplicit: true,
  preferences: ['Bookshops'], selectedPreferences: ['Bookshops'], notes: '',
});
const history = createRecommendationHistory();
for (let i = 1; i <= 5; i++) await diagnose(`CBD casual local date: plan ${i}/5`, { ...prefs, notes: 'casual local date' }, history);
await diagnose('Explicit Kinokuniya: recent history must not override the request', { ...prefs, notes: 'I want Kinokuniya' }, history);
await diagnose('Explicit sightseeing: landmarks stay eligible', { ...prefs, notes: 'I want sightseeing' });
await diagnose('No suitable opening window/budget: honest failure', { ...prefs, time: '02:00', timeExplicit: true, duration: 3, budget: 0 });
