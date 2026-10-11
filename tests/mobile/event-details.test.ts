import test from 'node:test';
import assert from 'node:assert/strict';
import { eventListingUrl, formatEventDate, formatEventPrices, openEventListing } from '../../apps/mobile/src/services/eventDetails.ts';

// All values are fixtures. Openers are mocks; no provider requests or bookings occur.
test('prices preserve advertised ranges, currency, decimals and zero without claiming free', () => {
  assert.equal(formatEventPrices([{ min: 25.5, max: 80, currency: 'AUD' }]), 'Advertised price: 25.5–80 AUD');
  assert.equal(formatEventPrices([{ min: 0, max: 0, currency: 'NZD' }]), 'Advertised price: 0 NZD');
  assert.equal(formatEventPrices([{ min: 10, max: null, currency: 'USD' }, { min: null, max: 30, currency: 'EUR' }]),
    'Advertised price: From 10 USD · Up to 30 EUR');
});

test('missing or unusable prices are unavailable and missing currency is not invented', () => {
  for (const ranges of [null, [], [{ min: null, max: null, currency: 'AUD' }],
    [{ min: NaN, max: Infinity, currency: 'AUD' }], [{ min: -5, max: null, currency: 'AUD' }],
    [{ min: 80, max: 25, currency: 'AUD' }]]) {
    assert.equal(formatEventPrices(ranges), 'Price unavailable');
  }
  assert.equal(formatEventPrices([{ min: 20, max: 40, currency: null }]), 'Advertised price: 20–40 (currency unavailable)');
  assert.equal(formatEventPrices(undefined as never), 'Price unavailable');
});

test('dates preserve the supplied local time and timezone; missing details stay explicit', () => {
  assert.equal(formatEventDate({ startDate: '2026-10-12', startTime: '19:00:00', timezone: 'Australia/Sydney' }),
    '2026-10-12 · 19:00:00 · Australia/Sydney');
  assert.equal(formatEventDate({ startDate: '2026-10-13', startTime: null, timezone: null }), '2026-10-13 · Time unconfirmed');
  assert.equal(formatEventDate({ startDate: '', startTime: null, timezone: null }), 'Date unavailable · Time unconfirmed');
});

test('only valid HTTP(S) listing URLs are accepted without stripping original parameters', () => {
  for (const url of ['https://tickets.example/event?id=fixture#details', 'http://tickets.example/event']) {
    assert.equal(eventListingUrl(url), url);
  }
  assert.equal(eventListingUrl(' https://tickets.example/event '), 'https://tickets.example/event');
  for (const url of [null, undefined, 123, '', 'tickets.example', '//tickets.example', 'javascript:alert(1)',
    'data:text/html,example', 'ftp://tickets.example', 'https://', 'https:///tickets.example',
    'https://user:password@tickets.example', 'https://tickets.example:bad',
    'https://tickets.example/some path', 'https://tickets.example/\\path', 'https://tickets.example/\npath']) {
    assert.equal(eventListingUrl(url), null, String(url));
  }
});

test('opening preserves the original listing URL and invalid URLs never call the opener', async () => {
  const calls: string[] = [];
  const open = async (url: string) => { calls.push(url); };
  const url = 'https://tickets.example/event?fixture=1';
  assert.equal(await openEventListing(url, open), true);
  assert.equal(await openEventListing('javascript:alert(1)', open), false);
  assert.deepEqual(calls, [url]);
});

test('rejected promises and synchronous link-opening failures are handled', async () => {
  const url = 'https://tickets.example/event';
  assert.equal(await openEventListing(url, async () => { throw new Error('Mock unavailable browser'); }), false);
  assert.equal(await openEventListing(url, () => { throw new Error('Mock synchronous failure'); }), false);
});
