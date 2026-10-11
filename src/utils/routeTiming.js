import { validDate } from './date.js';

export function formatRouteDate(date) {
  if (!validDate(date)) return 'Date unavailable';
  // The stored value is a Sydney calendar date, not a device-local instant.
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export function formatRouteDuration(value) {
  if (!Number.isFinite(value) || value < 0) return 'time unavailable';
  const total = Math.round(value), hours = Math.floor(total / 60), mins = total % 60;
  return hours ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
}

export function betweenStopsLabel(previous, stop, transport) {
  const gap = stop.arrival - previous.arrival - previous.mins;
  const travel = stop.travelFromPrevious?.minutes;
  if (!Number.isFinite(travel) || travel < 0) return Number.isFinite(gap) && gap >= 0
    ? `${formatRouteDuration(gap)} between stops · travel estimate unavailable`
    : 'travel estimate unavailable';
  const mode = transport === 'Walking' ? 'walk' : transport === 'Driving' ? 'drive'
    : transport === 'Public transport' ? 'on public transport' : 'travel buffer';
  const waiting = Number.isFinite(gap) ? Math.max(0, gap - travel) : 0;
  return `~${formatRouteDuration(travel)} ${mode}${Math.round(waiting) > 0 ? ` · ${formatRouteDuration(waiting)} wait` : ''}`;
}
