import { formatTime, type Transport } from '@melloway/domain';

// Deliberate allowlist: no profiles, notes, personal origin, full preferences or plan notice.
interface TextStop {
  name?: string;
  arrival?: number;
  lat?: number;
  lng?: number;
  mapsUri?: string;
  source?: 'demo' | 'google';
  travelFromPrevious?: { source: 'estimate' | 'google' } | null;
}
export interface ItineraryTextInput {
  prefs?: { date?: string; transport?: Transport };
  cost?: number;
  source?: 'estimate' | 'google';
  stops?: readonly TextStop[];
}

function arrivalTime(arrival: number | undefined): string {
  if (typeof arrival !== 'number' || !Number.isFinite(arrival) || arrival < 0) return 'Arrival time unavailable';
  const minutes = Math.round(arrival);
  const days = Math.floor(minutes / 1440);
  return `${formatTime(minutes % 1440)}${days ? ` (+${days} day${days === 1 ? '' : 's'})` : ''}`;
}

function stopMapLink(stop: TextStop): string | null {
  // Venue-only coordinates avoid carrying a personal origin or route parameters into the share.
  if (typeof stop.lat === 'number' && typeof stop.lng === 'number'
    && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    && Math.abs(stop.lat) <= 90 && Math.abs(stop.lng) <= 180) {
    return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
  }
  const value = stop.mapsUri?.trim();
  if (!value || !/^https?:\/\/[^/]/i.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password
      || ['origin', 'waypoints', 'saddr'].some(key => url.searchParams.has(key))
      || /\/(?:dir|directions)(?:\/|$)/i.test(url.pathname)) return null;
    return value;
  } catch { return null; }
}

/** Pure text only. Never serialize the plan object or include its free-form notice. */
export function formatItineraryText(plan: ItineraryTextInput): string {
  const stops = plan.stops ?? [];
  const spending = typeof plan.cost === 'number' && Number.isFinite(plan.cost) && plan.cost >= 0
    ? `~$${plan.cost.toFixed(2)} AUD` : 'Unavailable';
  const lines = ['Melloway plan', `Outing date: ${plan.prefs?.date?.trim() || 'Date unavailable'}`,
    `Transport: ${plan.prefs?.transport || 'Transport unavailable'}`,
    `Estimated spending per person: ${spending}`, ''];
  stops.forEach((stop, index) => {
    lines.push(`${index + 1}. ${stop.name?.trim() || 'Venue name unavailable'} — ${arrivalTime(stop.arrival)}`);
    const map = stopMapLink(stop);
    if (map) lines.push(`Map: ${map}`);
  });
  if (!stops.length) lines.push('No stops available.');
  lines.push('');
  if (stops.some(stop => stop.source === 'demo')) lines.push('Demo venues: sample hours/prices and approximate map pins.');
  if (plan.source === 'estimate' || stops.some(stop => stop.travelFromPrevious?.source === 'estimate')) {
    lines.push('Travel is a rough geographic estimate, not a calculated road or transit route.');
  }
  lines.push('Spending and arrival times are planning estimates; confirm venue hours and availability.');
  return lines.join('\n');
}
