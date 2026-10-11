import type { SydneyEvent } from '@melloway/domain';

/** Preserve Ticketmaster's local date/time and supplied timezone, without converting them. */
export function formatEventDate(event: Pick<SydneyEvent, 'startDate' | 'startTime' | 'timezone'>): string {
  const date = event.startDate?.trim() || 'Date unavailable';
  const time = event.startTime?.trim() || 'Time unconfirmed';
  const timezone = event.timezone?.trim();
  return `${date} · ${time}${timezone ? ` · ${timezone}` : ''}`;
}

export function formatEventPrices(ranges: SydneyEvent['priceRanges']): string {
  const prices = (ranges ?? []).flatMap(range => {
    const min = validAmount(range.min) ? range.min : null;
    const max = validAmount(range.max) ? range.max : null;
    if ((min === null && max === null) || (min !== null && max !== null && min > max)) return [];
    const amount = min !== null && max !== null ? (min === max ? `${min}` : `${min}–${max}`)
      : min !== null ? `From ${min}` : `Up to ${max}`;
    return [`${amount} ${range.currency?.trim() || '(currency unavailable)'}`];
  });
  return prices.length ? `Advertised price: ${prices.join(' · ')}` : 'Price unavailable';
}

function validAmount(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Require an explicit HTTP(S) URL; don't let URL parsing repair malformed links. */
export function eventListingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!/^https?:\/\/[^/]/i.test(url) || /[\s\\\u0000-\u001f\u007f]/.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return url;
  } catch { return null; }
}

/** Inject the platform opener so failures and invalid URLs can be tested without navigation. */
export async function openEventListing(value: unknown, openUrl: (url: string) => Promise<unknown>): Promise<boolean> {
  const url = eventListingUrl(value);
  if (!url) return false;
  try { await openUrl(url); return true; }
  catch { return false; }
}
