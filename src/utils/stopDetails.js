import { formatTime } from './planner.js';
import { closedOn, offsetDate } from './openingHours.js';

export function stopOpeningHours(stop, prefs) {
  const date = offsetDate(prefs.date, Math.floor(stop.arrival / 1440));
  if (closedOn(stop, date)) return 'Closed on this date';
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const windows = stop.weeklyHours ? stop.weeklyHours[day] : stop.hours ? [stop.hours] : null;
  const previousDate = offsetDate(date, -1);
  const previous = closedOn(stop, previousDate) ? [] : stop.weeklyHours ? stop.weeklyHours[(day + 6) % 7] : stop.hours ? [stop.hours] : [];
  const overnight = (previous || []).filter(w => w.close > 1440 && stop.arrival % 1440 < w.close - 1440);
  if (!windows && !overnight.length) return 'Hours unconfirmed · check with venue';
  if (!windows?.length && !overnight.length) return 'Closed on this date';
  const labels = [...overnight.map(w => `until ${formatTime(w.close % 1440)} · overnight from previous day`), ...(windows || []).map(w => `${formatTime(w.open % 1440)}–${formatTime(w.close % 1440)}${w.close >= 1440 ? ' next day' : ''}`)];
  return `${labels.join(', ')}${stop.source === 'demo' ? ' · sample hours' : ' · confirm before going'}`;
}

export function stopDirections(stop, transport) {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', `${stop.lat},${stop.lng}`);
  if (stop.source === 'google') url.searchParams.set('destination_place_id', stop.id);
  if (transport !== 'Not selected') url.searchParams.set('travelmode', transport === 'Walking' ? 'walking' : transport === 'Driving' ? 'driving' : 'transit');
  return url.href;
}
