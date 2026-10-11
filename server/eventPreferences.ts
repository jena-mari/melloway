import type { EventPreferences } from '@melloway/domain';

const zone = 'Australia/Sydney';
const localFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function localStamp(date: Date): string {
  const p = Object.fromEntries(localFormat.formatToParts(date).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
export const sydneyDate = (date: Date): string => localStamp(date).slice(0, 10);

export function validEventDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date;
}

/** Resolve Sydney wall time using ICU timezone rules. Repeated times use the first occurrence. */
export function sydneyInstant(date: string, time: string): Date {
  if (!validEventDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))
    throw new Error('Invalid Sydney date or time.');
  const stamp = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const reference = Date.parse(`${stamp}Z`);
  const candidates = [-1, 0, 1].map(day => {
    const sample = reference + day * 86_400_000;
    const offset = Date.parse(`${localStamp(new Date(sample))}Z`) - sample;
    return reference - offset;
  }).filter(candidate => localStamp(new Date(candidate)) === stamp);
  if (!candidates.length) throw new Error('That time does not exist in Sydney due to daylight saving.');
  return new Date(Math.min(...candidates));
}

export function readEventPreferences(params: URLSearchParams, now: Date): EventPreferences {
  for (const key of ['date', 'time', 'duration', 'budget', 'lat', 'lng', 'radius']) {
    if (params.getAll(key).length > 1) throw new Error('Duplicate event preferences.');
  }
  const date = params.get('date') || sydneyDate(now);
  const time = params.get('time') || '11:00';
  const number = (key: string, fallback: number): number => {
    const value = params.get(key);
    if (value !== null && !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid event preferences.');
    return value === null ? fallback : Number(value);
  };
  const duration = number('duration', 5);
  const budget = number('budget', 80);
  if (!validEventDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
    || !Number.isFinite(duration) || duration < 3 || duration > 8
    || !Number.isFinite(budget) || budget < 0 || budget > 200)
    throw new Error('Use a valid date, time, 3–8 hours and $0–$200 AUD budget.');
  sydneyInstant(date, time);
  let location: EventPreferences['location'] = null;
  if (['lat', 'lng', 'radius'].some(key => params.has(key))) {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    const r = number('radius', 5);
    if (!params.get('lat')?.trim() || !params.get('lng')?.trim()
      || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -34.3 || lat > -33.3 || lng < 150.5 || lng > 151.6 || r < 1 || r > 30)
      throw new Error('Use a Sydney location and a radius from 1–30 km.');
    location = { lat, lng, r };
  }
  return { date, time, duration, budget, location };
}

export function eventWindow(prefs: EventPreferences): { from: Date; to: Date; searchEnd: Date } {
  const from = sydneyInstant(prefs.date, prefs.time);
  const to = new Date(from.getTime() + prefs.duration * 3_600_000);
  const nextDate = new Date(`${prefs.date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const dayEnd = sydneyInstant(nextDate.toISOString().slice(0, 10), '00:00');
  return { from, to, searchEnd: new Date(Math.min(to.getTime(), dayEnd.getTime()) - 1000) };
}
