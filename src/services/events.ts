import type { EventPreferences, EventSearchResponse, MatchingSydneyEvent } from '@melloway/domain';

/** Only existing scheduling/budget/location answers are sent; profile demographics are excluded. */
export function eventQuery(prefs: {
  date?: string; time?: string; duration: number; budget: number;
  location?: EventPreferences['location'];
}): string {
  const query = new URLSearchParams({ time: prefs.time || '11:00',
    duration: String(prefs.duration), budget: String(prefs.budget) });
  if (prefs.date) query.set('date', prefs.date);
  if (prefs.location) {
    query.set('lat', String(prefs.location.lat));
    query.set('lng', String(prefs.location.lng));
    query.set('radius', String(prefs.location.r));
  }
  return query.toString();
}

export async function loadEvents(query: string, signal: AbortSignal): Promise<EventSearchResponse> {
  const env = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env;
  const base = (env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const response = await fetch(`${base}/api/events?${query}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) throw new Error(response.status === 503
    ? 'Ticketmaster events are unavailable: the server needs its Ticketmaster key.'
    : response.status === 400 ? 'Check your event date, hours, budget and Sydney location.'
      : 'Ticketmaster events could not be loaded. Please try again later.');
  const data = await response.json() as EventSearchResponse;
  if (!Array.isArray(data.events) || !Array.isArray(data.unknownPriceEvents))
    throw new Error('Ticketmaster events could not be loaded. Please try again later.');
  return data;
}

const when = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short',
});
export function eventPostFromTicketmaster(event: MatchingSydneyEvent) {
  const music = event.category === 'Music';
  let bookingUrl: string | null = null;
  try { if (event.url && new URL(event.url).protocol === 'https:') bookingUrl = event.url; } catch { /* No unsafe links. */ }
  return {
    id: `ticketmaster:${event.id}`, source: 'ticketmaster', title: event.name,
    type: music ? 'concerts' : event.category === 'Arts & Theatre' ? 'exhibitions' : (event.category || 'event').toLowerCase(),
    host: event.venue?.name || 'Ticketmaster', handle: 'ticketmaster', initials: 't',
    area: event.venue?.address || 'Sydney · venue unconfirmed',
    theme: music ? 'lilac' : 'pink', art: music ? 'record' : 'art',
    posterTitle: [event.name], posterSubtitle: 'Ticketmaster · Sydney',
    text: event.timeWindowFit === 'fits' ? 'Advertised start and finish fit your selected hours.'
      : 'Starts within your selected hours · finish time unknown; full attendance may not fit.',
    when: `${when.format(new Date(event.startDateTime!))} (Sydney time)${event.endDateTime ? ` – ${when.format(new Date(event.endDateTime))}` : ' · finish unknown'}`,
    entry: event.minimumPriceAUD === null ? 'AUD price unknown · budget fit unconfirmed'
      : `Advertised from $${event.minimumPriceAUD} AUD per person · check fees and availability`,
    details: 'Original Ticketmaster listing. Confirm ticket prices, fees, availability and event times before booking.',
    bookingUrl,
  };
}
