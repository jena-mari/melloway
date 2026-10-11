const normal = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const contains = (text, phrase) => (` ${normal(text)} `).includes(` ${normal(phrase)} `);

// Match complete business identities, including provider-added locality suffixes.
// A category word or a substring is not an explicit request for a business.
function aliases(venue) {
  const full = normal(venue.name);
  const localities = [normal(venue.area), 'sydney', ...String(venue.address || '').split(',')
    .map(part => normal(part.match(/^\s*(.*?)\s+(?:NSW|New South Wales)\s+\d{4}/i)?.[1]))];
  let short = full.replace(/^(?:the|books) /, '');
  for (let pass = 0; pass < 2; pass++)
    for (const locality of localities)
      if (locality && short.endsWith(` ${locality}`)) short = short.slice(0, -locality.length - 1);
  return [...new Set([full, short])].filter(name => name.length >= 4 &&
    !/^(?:books?|bookshops?|cafes?|coffee|matcha|museums?|galler(?:y|ies)|parks?)$/.test(name));
}

export function explicitlyRequestedVenue(venue, notes = '') {
  return String(notes).split(/[.!?;,\n]|\b(?:but|however|and)\b/i).some(clause =>
    !/\b(?:no|not|avoid|without|hate|dislike|don[’']?t|do not)\b/i.test(clause) &&
    aliases(venue).some(alias => contains(clause, alias)));
}

export function bindRequestedVenues(intent, prefs, all, resolveRoles = venue => venue.roles || []) {
  const venues = all.filter(venue => explicitlyRequestedVenue(venue, prefs.notes));
  const namedActivities = intent.requestedActivities.filter(activity =>
    venues.some(venue => explicitlyRequestedVenue(venue, activity.query)));
  const requestedActivities = intent.requestedActivities.filter(activity => !namedActivities.includes(activity));
  const namedQueries = namedActivities.map(activity => activity.query);
  const namedAsActivity = namedActivities.some(activity => activity.role === 'activity');
  return {
    ...intent,
    requestedActivities,
    requestedActivity: requestedActivities[0] || null,
    requestedVenueIds: venues.map(venue => venue.id),
    requiredTags: intent.requiredTags.filter(tag => !namedQueries.includes(tag)),
    requiredRoles: [...new Set([
      ...intent.requiredRoles.filter(role => role !== 'activity' || !namedAsActivity ||
        requestedActivities.some(activity => activity.role === role) ||
        intent.explicitInterests.some(tag => ['Arcades', 'Escape rooms', 'Photo booths', 'Music festivals'].includes(tag))),
      ...venues.map(venue => resolveRoles(venue)[0]).filter(Boolean),
    ])],
  };
}

// Only the existing reviewed catalogue description establishes independence.
// Provider query labels, social impressions and names cannot establish ownership.
export function independentBookshop(venue) {
  return venue.source === 'curated' && venue.tags?.includes('Bookshops') &&
    venue.sources?.some(source => /^https:\/\//.test(source.url || '')) &&
    /\bindependent\b/i.test(venue.description || '') &&
    !/\b(?:not|no longer) independent\b/i.test(venue.description || '');
}
