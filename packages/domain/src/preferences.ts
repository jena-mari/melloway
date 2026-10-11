import type { Area, Preferences } from './types.ts';

export const areas: Record<string, Area> = {
  'Anywhere in Sydney': { lat: -33.88, lng: 151.2, r: 30 },
  'Sydney CBD': { lat: -33.872, lng: 151.208, r: 2.5 },
  Newtown: { lat: -33.8965, lng: 151.1794, r: 2 },
  'Surry Hills': { lat: -33.8847, lng: 151.211, r: 2 },
  'Inner West': { lat: -33.8965, lng: 151.1794, r: 5 },
  'Eastern Suburbs': { lat: -33.8841, lng: 151.2273, r: 6 },
};
export const categories: Record<string, string[]> = {
  'typa hangout': ['Flea markets', 'Thrifting', 'Vintage stores', 'Matcha cafés', 'Coffee shops', 'Jazz bars', 'Live music', 'Beaches', 'Bookshops', 'Art galleries'],
  'typa food': ['Asian food', 'Italian food', 'Café food', 'Brunch', 'Dinner', 'Desserts', 'Street food'],
  'typa activity': ['Escape rooms', 'Music festivals', 'Arcades', 'Museums', 'Photo spots', 'Picnics', 'Shopping', 'Scenic walks'],
};
export function sydneyToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
export const defaultDraft = (): Preferences => ({
  mode: 'date', name: '', age: 24, gender: '', companion: 'my person', partner: '',
  area: 'Sydney CBD', budget: 80, date: sydneyToday(), time: '11:00',
  transport: 'Not selected', duration: 5, preferences: [],
});

/** Validate mobile input at the boundary; the migrated optimiser is unchanged. */
export function validatePreferences(prefs: Preferences, today = sydneyToday()): string | null {
  if (!Object.hasOwn(areas, prefs.area)) return 'Choose a Sydney starting area.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prefs.date)) return 'Enter a date as YYYY-MM-DD.';
  const day = new Date(`${prefs.date}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== prefs.date || prefs.date < today) {
    return 'Pick today or a future calendar date.';
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.time)) return 'Enter a starting time as HH:MM (24-hour).';
  if (!Number.isFinite(prefs.budget) || prefs.budget < 0 || prefs.budget > 200) return 'Budget must be between $0 and $200 per person.';
  if (![3, 4, 5, 6, 8].includes(prefs.duration)) return 'Choose an available outing duration.';
  if (!['Not selected', 'Walking', 'Public transport', 'Driving'].includes(prefs.transport)) return 'Choose a travel method.';
  return null;
}
