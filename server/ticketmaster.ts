/** Server-only Ticketmaster Discovery API client. Never import into either frontend. */
import type { SydneyEvent } from '@melloway/domain';
export type { SydneyEvent } from '@melloway/domain';

interface ApiEvent {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string;
      dateTBA?: boolean; dateTBD?: boolean; timeTBA?: boolean; noSpecificTime?: boolean };
    timezone?: string;
    status?: { code?: string };
  };
  _embedded?: { venues?: {
    name?: string; timezone?: string; postalCode?: string;
    address?: { line1?: string; line2?: string; line3?: string };
    city?: { name?: string }; state?: { stateCode?: string }; country?: { name?: string };
    location?: { latitude?: string | number; longitude?: string | number };
  }[] };
  classifications?: { primary?: boolean; segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const price = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function sydneyDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function normalize(event: ApiEvent, from: Date, to: Date): SydneyEvent | null {
  const start = event.dates?.start;
  const status = event.dates?.status?.code?.toLowerCase();
  if (!text(event.id) || !text(event.name) || !start || start.dateTBA || start.dateTBD
    || ['canceled', 'cancelled', 'postponed'].includes(status ?? '') || !validDate(start.localDate)) return null;
  const timeKnown = !start.timeTBA && !start.noSpecificTime;
  const dateTime = timeKnown ? text(start.dateTime) : null;
  if (dateTime) {
    // Require an explicit offset; never interpret provider timestamps in the server's local timezone.
    const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateTime) ? Date.parse(dateTime) : NaN;
    if (!Number.isFinite(timestamp) || timestamp < from.getTime() || timestamp > to.getTime()) return null;
  } else if (start.localDate < sydneyDate(from) || start.localDate > sydneyDate(to)) return null;

  const venue = event._embedded?.venues?.[0];
  const address = venue ? [venue.address?.line1, venue.address?.line2, venue.address?.line3,
    venue.city?.name, venue.state?.stateCode, venue.postalCode, venue.country?.name]
    .map(text).filter(Boolean).join(', ') || null : null;
  const classification = event.classifications?.find(c => c.primary) ?? event.classifications?.[0];
  const ranges = event.priceRanges?.map(range => ({
    min: price(range.min), max: price(range.max), currency: text(range.currency),
  })).filter(range => range.min !== null || range.max !== null) ?? [];
  return {
    id: event.id!, name: event.name!, startDate: start.localDate,
    startTime: timeKnown ? text(start.localTime) : null,
    startDateTime: dateTime,
    timezone: text(event.dates?.timezone) ?? text(venue?.timezone),
    venue: venue ? { name: text(venue.name), address,
      latitude: coordinate(venue.location?.latitude, 90), longitude: coordinate(venue.location?.longitude, 180) } : null,
    category: text(classification?.segment?.name) ?? text(classification?.genre?.name),
    url: text(event.url), priceRanges: ranges.length ? ranges : null,
  };
}

/** One request for at most 10 results; no demo fallback, pagination or other providers. */
export async function fetchSydneyEvents(options: {
  fetcher?: typeof globalThis.fetch; now?: Date;
} = {}): Promise<SydneyEvent[]> {
  const key = process.env.TICKETMASTER_API_KEY?.trim();
  if (!key) throw new Error('Set TICKETMASTER_API_KEY in your server environment or root .env file.');
  const from = options.now ?? new Date();
  if (!Number.isFinite(from.getTime())) throw new Error('Invalid event search date.');
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  url.search = new URLSearchParams({
    apikey: key, city: 'Sydney', countryCode: 'AU', source: 'ticketmaster',
    startDateTime: from.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endDateTime: to.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    includeTBA: 'no', includeTBD: 'no', size: '10', sort: 'date,asc',
  }).toString();
  let response: Response;
  try {
    response = await (options.fetcher ?? globalThis.fetch)(url, {
      signal: AbortSignal.timeout(10_000), redirect: 'error', headers: { Accept: 'application/json' },
    });
  } catch {
    // Fetch errors can contain the full URL/API key. Do not retain their message or cause.
    throw new Error('Ticketmaster request failed or timed out.');
  }
  if (!response.ok) throw new Error(`Ticketmaster API returned HTTP ${response.status}.`);
  let payload: { _embedded?: { events?: ApiEvent[] } };
  try {
    payload = await response.json();
    if (!payload || typeof payload !== 'object' || 'fault' in payload || 'errors' in payload
      || (payload._embedded !== undefined && (!payload._embedded
        || typeof payload._embedded !== 'object'
        || (payload._embedded.events !== undefined && !Array.isArray(payload._embedded.events))))) throw new Error();
  } catch {
    throw new Error('Ticketmaster returned an invalid response.');
  }
  try {
    return (payload._embedded?.events ?? []).filter(event => event && typeof event === 'object')
      .map(event => normalize(event, from, to)).filter((event): event is SydneyEvent => event !== null).slice(0, 10);
  } catch {
    throw new Error('Ticketmaster returned an invalid event response.');
  }
}
