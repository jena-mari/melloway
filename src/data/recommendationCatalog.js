import { curatedVenuesForDate } from './sydneyVenues.js';
import { editorialPicks } from './editorialPicks.js';
import { sameBusiness } from '../engine/discoveryPool.ts';

// Activity labels come from the existing reviewed descriptions, never a search
// query. Browsing Picks with missing hours, prices or access stay browsing-only.
const activities = {
  'pick-caterpillar-club': { tags: ['Cocktail bars', 'Live music'], roles: ['bar'] },
  'pick-joji-sydney': { tags: ['Cocktail bars', 'Asian food', 'Dinner'], roles: ['bar', 'meal'], minimumAge: 18 },
  'pick-mamuki-glebe': { tags: ['Matcha cafés', 'Coffee shops', 'Brunch'], roles: ['cafe'] },
};

export function schedulableEditorialPick(venue, date) {
  if (venue.accessStatus === 'unverified' || venue.membershipRequired ||
      /membership|sign-up is required/i.test(venue.conditions || '')) return false;
  if (venue.kind === 'recurring-event' &&
      (venue.eventSchedule?.weekday !== new Date(`${date}T12:00:00Z`).getUTCDay() ||
       !venue.eventSchedule?.end)) return false;
  return [venue.id, venue.name, venue.address, venue.website].every(value => typeof value === 'string' && value.length > 0) &&
    [venue.lat, venue.lng, venue.cost, venue.mins].every(Number.isFinite) && venue.cost >= 0 && venue.mins > 0 &&
    ['published', 'reported'].includes(venue.hoursStatus) &&
    Array.isArray(venue.weeklyHours) && venue.weeklyHours.length === 7 &&
    venue.weeklyHours.every(day => Array.isArray(day) && day.every(window =>
      Number.isFinite(window.open) && Number.isFinite(window.close) && window.open >= 0 && window.close > window.open)) &&
    venue.weeklyHours.some(day => day.length) && venue.roles?.length > 0 &&
    venue.sources?.some(source => source.fields?.includes('name') && source.fields?.includes('address'));
}

export function recommendationVenuesForDate(date) {
  const pool = curatedVenuesForDate(date);
  for (const pick of editorialPicks) {
    const venue = { ...pick, ...activities[pick.id] };
    if (!schedulableEditorialPick(venue, date)) continue;
    const duplicate = pool.findIndex(existing => sameBusiness(existing, venue));
    // Keep the established record's venue facts and ID when a Pick overlaps it.
    if (duplicate >= 0) pool[duplicate] = { ...pool[duplicate], editorialPick: true };
    else pool.push(venue);
  }
  return pool;
}
