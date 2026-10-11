import { socialPost } from '../utils/social.js';
import { recommendationLeads } from '../data/recommendationSources.js';
const normal = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const domains = ['russh.com', 'reddit.com', '2cameras1bucketlist.com', 'broadsheet.com.au', 'timeout.com', 'concreteplayground.com', 'theurbanlist.com', 'tiktok.com', 'instagram.com'];
export function evidenceUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains.includes(host)) return null;
    if (host === 'tiktok.com' || host === 'instagram.com') return socialPost(url.href)?.url || null;
    if (host === 'reddit.com' && !/^\/r\/[^/]+\/comments\/[^/]+\//.test(url.pathname)) return null;
    if (url.pathname === '/' || /\/(search|explore)(\/|$)/.test(url.pathname)) return null;
    url.hash = ''; url.search = '';
    return url.href;
  } catch { return null; }
}
export function sourceKind(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host === 'reddit.com' ? 'community' : ['instagram.com', 'tiktok.com'].includes(host) ? 'social' : 'editorial';
}
export function cleanEvidence(items) {
  const merged = new Map();
  const caution = { positive: 0, mixed: 1, negative: 2 };
  for (const item of Array.isArray(items) ? items : []) {
    const url = evidenceUrl(item?.url);
    if (!url || !['positive', 'mixed', 'negative'].includes(item.sentiment)) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt || '') && Number.isFinite(Date.parse(item.publishedAt)) ? item.publishedAt : undefined;
    const entry = { url, kind: sourceKind(url), sentiment: item.sentiment,
      origin: ['independent', 'venue', 'sponsored'].includes(item.origin) ? item.origin : 'unknown',
      summary: String(item.summary || '').slice(0, 180), checkedAt: String(item.checkedAt || '').slice(0, 10),
      ...(date ? { publishedAt: date } : {}), historical: item.historical === true };
    const previous = merged.get(url);
    // Duplicate pages cannot multiply votes or hide a conflicting account.
    if (!previous || caution[entry.sentiment] > caution[previous.sentiment] ||
      (entry.sentiment === previous.sentiment && entry.publishedAt && (!previous.publishedAt || entry.publishedAt > previous.publishedAt))) merged.set(url, entry);
  }
  return [...merged.values()].slice(0, 8);
}
export function matchesLead(venue, lead) {
  if (!venue || !lead || typeof lead.name !== 'string' || typeof lead.locality !== 'string') return false;
  const locality = normal(lead.locality);
  if (!locality) return false;
  // Exact name/alias plus branch locality; never attach a brand's evidence city-wide.
  const names = [lead.name, ...(Array.isArray(lead.aliases) ? lead.aliases : [])].map(normal);
  const name = normal(venue.name);
  const matchingName = names.some(n => name === n || name === `${n} ${locality}` || name === `${n} sydney`);
  const address = normal(venue.address);
  const localityMatches = locality === 'sydney' ? /\bsydney\b/.test(address) && !/\b(melbourne|brisbane)\b/.test(address)
    : (` ${address} `).includes(` ${locality} `);
  return matchingName && localityMatches;
}
export function attachRecommendationEvidence(venues, leads = recommendationLeads) {
  const unambiguous = leads.filter(lead => {
    const matches = venues.filter(venue => matchesLead(venue, lead));
    return new Set(matches.map(venue => normal(venue.address))).size <= 1;
  });
  return venues.map(venue => {
    const evidence = cleanEvidence([...(venue.recommendationEvidence || []), ...unambiguous.filter(lead => matchesLead(venue, lead)).flatMap(lead => lead.evidence || [])]);
    return evidence.length ? { ...venue, recommendationEvidence: evidence } : venue;
  });
}
export function evidenceScore(venue, date) {
  const evidence = cleanEvidence(venue.recommendationEvidence);
  const groups = new Map();
  for (const item of evidence) {
    const age = item.publishedAt ? (Date.parse(date) - Date.parse(item.publishedAt)) / 86400000 : null;
    // A new lookup is not a new recommendation. Unknown/old dates earn less.
    const freshness = item.historical ? 0.35 : age === null || !Number.isFinite(age) ? 0.65 : age < 0 ? 0 : age < 180 ? 1 : age < 730 ? 0.65 : 0.35;
    const domain = new URL(item.url).hostname.replace(/^www\./, '');
    const independence = item.origin === 'independent' ? 1 : item.origin === 'unknown' ? 0.5 : 0.25;
    const strength = (item.kind === 'social' ? 0.65 : 1) * freshness * independence;
    const group = groups.get(domain) || { positive: 0, negative: 0 };
    if (item.sentiment === 'positive') group.positive = Math.max(group.positive, strength);
    else group.negative = Math.max(group.negative, strength * (item.sentiment === 'mixed' ? 0.5 : 1));
    groups.set(domain, group);
  }
  const positive = [...groups.values()].reduce((sum, g) => sum + g.positive, 0);
  const negative = [...groups.values()].reduce((sum, g) => sum + g.negative, 0);
  return Math.max(-1, Math.min(1, (positive - negative) / 2));
}
export const venueAccessFacts = [{ host: 'fyreevents.com.au', name: 'Fyre Photo Booths', visitMode: 'event-service', source: 'https://www.fyreevents.com.au/', checkedAt: '2026-10-11' }];
export function eventServiceOnly(venue) {
  let host = ''; try { host = new URL(venue.website).hostname.replace(/^www\./, ''); } catch { /* No operator URL. */ }
  const operator = venueAccessFacts.find(fact => fact.host === host);
  return operator?.visitMode === 'event-service' || (venue.tags?.includes('Photo booths') && venue.providerTypes?.some(type => ['event_planner', 'wedding_planner', 'photography_service'].includes(type))) || venue.pureServiceAreaBusiness === true || venue.visitMode === 'event-service' || (venue.tags?.includes('Photo booths') && /\b(hire|rental|rentals|wedding|corporate|event service)\b/i.test([venue.name, venue.website].join(' ')));
}
