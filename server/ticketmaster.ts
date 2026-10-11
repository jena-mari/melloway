/** Server-only Ticketmaster Discovery API client. Never import into either frontend. */
import type { SydneyEvent, EventPreferences, MatchingSydneyEvent } from '@melloway/domain';
import { eventWindow, sydneyInstant, sydneyDate } from './eventPreferences.ts';
export type { SydneyEvent } from '@melloway/domain';

interface ApiEvent {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string;
      dateTBA?: boolean; dateTBD?: boolean; timeTBA?: boolean; noSpecificTime?: boolean };
    timezone?: string;
    end?: { dateTime?: string; approximate?: boolean };
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
function explicitInstant(value: unknown): string | null {
  const stamp = text(value);
  return stamp && /(?:Z|[+-]\d{2}:\d{2})$/i.test(stamp) && Number.isFinite(Date.parse(stamp)) ? stamp : null;
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
    ...(event.dates?.end ? { endDateTime: event.dates.end.approximate ? null : explicitInstant(event.dates.end.dateTime) } : {}),
    timezone: text(event.dates?.timezone) ?? text(venue?.timezone),
    venue: venue ? { name: text(venue.name), address,
      latitude: coordinate(venue.location?.latitude, 90), longitude: coordinate(venue.location?.longitude, 180) } : null,
    category: text(classification?.segment?.name) ?? text(classification?.genre?.name),
    url: text(event.url), priceRanges: ranges.length ? ranges : null,
  };
}

interface FetchOptions { fetcher?: typeof globalThis.fetch; now?: Date }

/** Bounded provider search; never follow provider-supplied pagination URLs. */
async function fetchEvents(options: FetchOptions, preferences?: EventPreferences): Promise<{ events: SydneyEvent[]; truncated: boolean }> {
  const key = process.env.TICKETMASTER_API_KEY?.trim();
  if (!key) throw new Error('Set TICKETMASTER_API_KEY in your server environment or root .env file.');
  const window = preferences ? eventWindow(preferences) : null;
  const from = window?.from ?? options.now ?? new Date();
  if (!Number.isFinite(from.getTime())) throw new Error('Invalid event search date.');
  const to = window?.searchEnd ?? new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  const pageSize = preferences ? 50 : 10;
  const maxPages = preferences ? 3 : 1;
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  url.search = new URLSearchParams({
    apikey: key, city: 'Sydney', countryCode: 'AU', source: 'ticketmaster',
    startDateTime: from.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endDateTime: to.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    includeTBA: 'no', includeTBD: 'no', size: String(pageSize), sort: 'date,asc',
  }).toString();
  if (preferences?.location) {
    url.searchParams.delete('city');
    url.searchParams.set('latlong', `${preferences.location.lat},${preferences.location.lng}`);
    url.searchParams.set('radius', String(preferences.location.r));
    url.searchParams.set('unit', 'km');
  }
  const signal = AbortSignal.timeout(10_000); // One deadline shared by every page.
  const events = new Map<string, SydneyEvent>();
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    if (preferences) url.searchParams.set('page', String(page));
    let response: Response;
    try {
      response = await (options.fetcher ?? globalThis.fetch)(url, {
        signal, redirect: 'error', headers: { Accept: 'application/json' },
      });
    } catch {
      // Fetch errors can contain the full URL/API key. Do not retain their message or cause.
      throw new Error('Ticketmaster request failed or timed out.');
    }
    if (!response.ok) throw new Error(`Ticketmaster API returned HTTP ${response.status}.`);
    let payload: { _embedded?: { events?: ApiEvent[] }; page?: { totalPages?: number } };
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
      for (const raw of (payload._embedded?.events ?? []).slice(0, pageSize)) {
        if (!raw || typeof raw !== 'object') continue;
        const event = normalize(raw, from, to);
        if (event) events.set(event.id, event);
      }
    } catch {
      throw new Error('Ticketmaster returned an invalid event response.');
    }
    const totalPages = payload.page?.totalPages;
    const more = typeof totalPages === 'number' && Number.isInteger(totalPages) && totalPages > page + 1;
    if (!more || !(payload._embedded?.events?.length)) break;
    truncated = page + 1 === maxPages;
  }
  return { events: [...events.values()], truncated };
}

/** Preserve the existing CLI's ten-event, 30-day snapshot. */
export async function fetchSydneyEvents(options: FetchOptions = {}): Promise<SydneyEvent[]> {
  return (await fetchEvents(options)).events;
}

function withinLocation(event: SydneyEvent, location: EventPreferences['location']): boolean {
  if (!location) return true;
  const lat = event.venue?.latitude;
  const lng = event.venue?.longitude;
  if (lat == null || lng == null) return false; // Cannot establish a location match.
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(lat - location.lat) / 2) ** 2
    + Math.cos(radians(lat)) * Math.cos(radians(location.lat)) * Math.sin(radians(lng - location.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a))) <= location.r;
}

export async function searchSydneyEvents(preferences: EventPreferences, options: FetchOptions = {}) {
  const result = await fetchEvents(options, preferences);
  const { from, to } = eventWindow(preferences);
  const events: MatchingSydneyEvent[] = [];
  const unknownPriceEvents: MatchingSydneyEvent[] = [];
  for (const event of result.events) {
    if (event.startDate !== preferences.date || !withinLocation(event, preferences.location)) continue;
    let start: number;
    try {
      start = event.startDateTime ? Date.parse(event.startDateTime)
        : event.startTime ? sydneyInstant(event.startDate, event.startTime).getTime() : NaN;
    } catch { continue; }
    if (!Number.isFinite(start) || sydneyDate(new Date(start)) !== preferences.date
      || start < from.getTime() || start >= to.getTime()) continue;
    const end = event.endDateTime ? Date.parse(event.endDateTime) : null;
    if (end !== null && (end <= start || end > to.getTime())) continue;
    const prices = event.priceRanges?.filter(p => p.currency?.toUpperCase() === 'AUD' && p.min !== null)
      .map(p => p.min!) ?? [];
    const minimumPriceAUD = prices.length ? Math.min(...prices) : null;
    if (minimumPriceAUD !== null && minimumPriceAUD > preferences.budget) continue;
    const match: MatchingSydneyEvent = { ...event, startDateTime: new Date(start).toISOString(),
      endDateTime: event.endDateTime ?? null, minimumPriceAUD, timeWindowFit: end === null ? 'start-only' : 'fits' };
    (minimumPriceAUD === null ? unknownPriceEvents : events).push(match);
  }
  return { events, unknownPriceEvents, truncated: result.truncated };
}
