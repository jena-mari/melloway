// Open vocabulary: facility phrases do not have to belong to the preference tags.
import { independentBookshop } from './venueIdentity.js';
import { unrelatedServiceBusiness } from './venueSuitability.js';
const normalize = (value) => String(value || "").normalize("NFKD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/skateparks?/g, "skate park")
  .replace(/skateboarding/g, "skate park").replace(/[^a-z0-9]+/g, " ").trim();
const words = (value) => normalize(value).split(/\s+/).map(word =>
  word.endsWith("ies") ? word.slice(0, -3) + "y" : word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
const contains = (value, phrase) => (` ${words(value).join(" ")} `).includes(` ${words(phrase).join(" ")} `);
const knownTypes = [
  [/^skate park$/, "skateboard_park", "activity", true],
  [/^(?:coffee shop|cafe)$/, "cafe", "cafe", false],
  [/^art gallery$/, "art_gallery", "culture", false],
  [/^museum$/, "museum", "culture", false],
  [/^(?:bookshop|book store)$/, "book_store", "bookshop", false],
  [/^beach$/, "beach", "walk", true],
  [/^park$/, "park", "walk", true],
];

export function activityDescriptor(phrase) {
  const normalized = words(phrase).join(" ");
  const query = /^(?:(?:vinyl|record)(?: record)? (?:shop|store)|vinyl record)$/.test(normalized)
    ? 'record store' : normalized;
  const known = knownTypes.find(([pattern]) => pattern.test(query));
  const role = /\b(?:coffee|cafe|matcha|brunch)\b/.test(query) ? "cafe"
    : /\b(?:dining|dinner|food|restaurant)\b/.test(query) ? "meal"
    : /\b(?:speakeasy|bar|music|jazz)\b/.test(query) ? "bar"
    : /\b(?:bookshop|book store)\b/.test(query) ? "bookshop"
    : /\b(?:vintage|thrift|shopping|record store)\b/.test(query) ? "shop"
    : /\b(?:gallery|museum)\b/.test(query) ? "culture"
    : /\b(?:dessert)\b/.test(query) ? "dessert" : "activity";
  return { query, role: known?.[2] || role, ...(known ? { placeType: known[1] } : {}),
    outdoor: known?.[3] ?? /\b(?:park|beach|court|playground|trail|garden)\b/.test(query) };
}

function extractActivities(notes = "", excluded = false) {
  if (typeof notes !== "string") return [];
  const activities = [];
  // Bounded noun phrases, not arbitrary prose or another model call. A request
  // prefix carries across "and"; negation remains local to each clause.
  for (const sentence of notes.slice(0, 1200).split(/[.!?;\n]|\b(?:but|however|then)\b/i)) {
    let requesting = false;
    let negated = false;
    for (const clause of sentence.split(/\band\b|,|\+/i)) {
      if (/^\s*include\b/i.test(clause)) continue;
      const request = clause.match(/\b(?:want|would like|[’']d like|looking for|find|visit|go to|browse|shop for|stop by|check out)\s+(.+)/i) ||
        clause.match(/\b(?:no|not|avoid|without|hate|dislike)\s+(.+)/i);
      const negative = /\b(?:no|not|avoid|without|hate|dislike|don[’']?t|do not)\b/i.test(clause);
      if (request || negative || !requesting) negated = negative;
      requesting ||= !!request;
      if (negated !== excluded) continue;
      const phrase = (request?.[1] || clause).trim().split(/\b(?:with|near|around|in|at|after|before|for)\b/i)[0]
        .replace(/^(?:(?:also|to|go(?: to)?|visit|browse|try|do|see|stop by|check out|avoid|without|a|an|the|some|please|nice|good|great|nearby|local|free|cheap|outdoor|quiet|cozy)\s+)+/i, "")
        .replace(/\s+please$/i, "").trim();
      const normalized = normalize(phrase).replace(/^skate$/, "skate park")
        .replace(/^(?:indie|independent) (?:bookshops?|book ?stores?)$/, 'independent bookshop')
        .replace(/^vintage (?:shopping|shops?|stores?)$/, 'vintage store');
      if (!requesting && !/\b(?:park|skatepark|gym|studio|court|pool|rink|gallery|museum|beach|trail|garden|bookshops?|cafe|vinyl|records?)\b/.test(normalized)) continue;
      if (!normalized || normalized.length > 80 || normalized.split(" ").length > 6 ||
        /\b(?:something|anything|somewhere|outing|date|day|night|fun|chill|relax|romantic|travel)\b/.test(normalized)) continue;
      const activity = activityDescriptor(normalized);
      if (!activities.some(a => a.query === activity.query)) activities.push(activity);
      if (activities.length === 4) return activities;
    }
  }
  return activities;
}
export const extractRequestedActivities = notes => extractActivities(notes);
export const extractExcludedActivities = notes => extractActivities(notes, true);
export const extractRequestedActivity = notes => extractRequestedActivities(notes)[0] || null;
export const matchesAnyRequestedActivity = (venue, intent) =>
  (intent.requestedActivities || (intent.requestedActivity ? [intent.requestedActivity] : []))
    .some(activity => matchesRequestedActivity(venue, activity));

export function matchesRequestedActivity(venue, activity) {
  if (!activity) return false;
  if (activity.query === 'record store') return recordRetailer(venue);
  if (activity.query === 'independent bookshop')
    return independentBookshop(venue);
  const types = Array.isArray(venue.providerTypes) ? venue.providerTypes : [];
  if (activity.placeType && types.includes(activity.placeType)) return true;
  // A café/shop named after a park is not evidence of the requested facility.
  if (activity.outdoor && (types.some(t => /(?:store|restaurant|cafe|bar|lodging)$/.test(t)) ||
    /\b(?:cafe|coffee|shop|store|supplies|equipment|rental|restaurant|bar|hotel)\b/.test(normalize(venue.name)))) return false;
  if (contains(venue.name, activity.query) || types.some(t => contains(t, activity.query))) return true;
  // Curated categories/tags are reviewed facts. A Google query label is not.
  return venue.source === "curated" && [venue.category, ...(venue.tags || [])].some(value =>
    contains(value, activity.query) || (activity.placeType && activityDescriptor(value).placeType === activity.placeType));
}

export function recordRetailer(venue) {
  if (unrelatedServiceBusiness(venue) ||
      /\b(?:recording studio|record label|music production|record(?:s)? (?:management|storage)|vinyl (?:flooring|wraps?|signs?|printing))\b/i.test(venue.name || '')) return false;
  if (venue.source === 'curated') {
    const retailRole = venue.roles?.includes('shop') || activityDescriptor(venue.category).query === 'record store';
    const reviewedRetail = [venue.category, ...(venue.tags || [])].some(label => activityDescriptor(label).query === 'record store') ||
      /\b(?:record (?:shop|store)|(?:sells?|selling|retailer of|browse) (?:new |used |second.hand )?(?:vinyl|records))\b/i.test(venue.description || '');
    return retailRole && reviewedRetail;
  }
  if (venue.source !== 'google') return false;
  const name = normalize(venue.name);
  const types = Array.isArray(venue.providerTypes) ? venue.providerTypes : [];
  const retailType = types.some(type => /(?:^|_)store$/.test(type));
  const namedRetail = /\b(?:records?|vinyl(?: records?)?) (?:shops?|stores?)\b/.test(name);
  const recordIdentity = /\brecords\b/.test(name) || namedRetail;
  // A broad store type plus a record-retail identity is evidence; the query/tag
  // alone is not. Explicit shop identities may have only generic Places types.
  return recordIdentity && (retailType || namedRetail &&
    types.every(type => ['establishment', 'point_of_interest'].includes(type)));
}

export function outdoorActivityVenue(venue, activity) {
  const outdoorTypes = ["skateboard_park", "park", "dog_park", "beach", "playground", "garden", "hiking_area", "athletic_field"];
  // The search phrase alone cannot establish that a facility is outdoors.
  return activity?.outdoor && matchesRequestedActivity(venue, activity) &&
    !/\bindoor\b/i.test(venue.name) && !venue.providerTypes?.includes("sports_complex") &&
    (venue.providerTypes?.some(type => outdoorTypes.includes(type)) || /\boutdoor\b/i.test(venue.name));
}
