# Fetch upcoming Sydney events

The standalone server module uses the official [Ticketmaster Discovery API v2](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/). It makes one request for at most 10 Ticketmaster-source events in Sydney, Australia, within the next 30 × 24 hours, in date order. It does not backfill excluded results with additional requests or substitute demo events.

Obtain a Discovery API consumer key from the [Ticketmaster developer portal](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/). Add `TICKETMASTER_API_KEY=your_actual_key` to the ignored root `.env`, preserving all other existing values. Never print, commit or expose this private key through frontend variables. `.env.example` has an empty placeholder only.

From the repository root, with Node 22.13 or newer:

```sh
npm ci
npm run events:sydney
```

The runner prints a JSON array; empty results are `[]`. Missing credentials, HTTP/network failures, timeout and invalid responses produce safe errors and exit status 1. It does not print request URLs, provider response bodies or keys.

Each event includes `id`, `name`, `startDate`, nullable local `startTime`, nullable provider `startDateTime`, `timezone`, `venue` (name, joined address and coordinates), `category`, original event `url`, and `priceRanges` (min, max and supplied currency). Missing optional values and missing prices are null. Explicit zero prices are preserved without assuming an event is free. Separate ranges/currencies are retained.

Cancelled, postponed, date-TBA/date-TBD and missing/invalid-date events are excluded. Confirmed dates with unknown times remain included. Exact timestamps use the rolling window; date-only events use Sydney calendar dates. Venue timezone can supply a missing event timezone; no timezone, currency or coordinates are invented.

## Additive JSON endpoint

```sh
npm run server
curl http://127.0.0.1:3001/api/events
```

This is an explicit live Ticketmaster check when a real key is configured; it is not run by tests. `GET /api/events` returns `{ events, points, missingCoordinates, mapAvailable }`. Points group shared coordinates without losing event IDs. Events lacking coordinates remain in the event array. The endpoint shares an in-memory 60-second snapshot between requests, including concurrent requests, and uses the existing server request rate limit. A missing Ticketmaster key gives 503; provider failures give a safe 502. No Google request is made by this endpoint.

`mapAvailable` reports whether a nonblank browser key is configured; it does not establish that the key is valid or that main has a map UI. Selection prefers `GOOGLE_MAPS_JS_KEY`, with `GOOGLE_MAPS_DEMO_KEY` as an optional fallback. The private Places/Routes key is never used as a browser-key fallback, and no key is returned in JSON.

**Main preserves the teammate's frontend.** The generated Expo event screen and server-hosted HTML map remain on their original branches. `/api/events-map` is deliberately not integrated into main. No frontend screen, map renderer or itinerary connection is added by this backend consolidation.

## Browser-key configuration retained for a future frontend integration

Put a real `GOOGLE_MAPS_JS_KEY` only in the ignored root `.env`, editing that single variable without replacing other values. The placeholder in `.env.example` is empty. The optional Demo Key is selected only if the standard key is blank/unset. Browser map keys are visible to map viewers at runtime; keep them separate from private Ticketmaster, OpenAI and Places/Routes credentials.

Keep the standard key restricted in Google Cloud Console → APIs & Services → Credentials:

- API restriction: Maps JavaScript API only.
- Application restriction: Websites (HTTP referrers), allowing only the actual map-page protocol, host and port. For the existing map page retained on its original branch, the default is `http://localhost:3001/*`; add `http://127.0.0.1:3001/*` only when used. Its isolated prototype uses `http://localhost:3002/*`. These refer to the backend map-page origin, not an outer Expo page.
- A future teammate-owned map must use its actual origin. No main map-page origin exists yet. Do not remove restrictions to fix errors or allow invented/unrelated domains.

No APIs, quotas, billing upgrades or key restrictions were changed during integration. No guaranteed free usage or spending cap is asserted. Existing trial/account settings are left untouched. See [Google's API-key guidance](https://developers.google.com/maps/api-security-best-practices).

## Mocked verification

```sh
npm run test:events
npm run typecheck:backend
```

These tests need no credentials and make no real Ticketmaster or Google requests. They cover provider parsing/errors, missing optional values/prices, confirmed dates, venue points, caching, browser-key selection, missing configuration and safe JSON errors. They are included in `npm test`. See [the backend integration record](BACKEND_INTEGRATION.md) for final test counts and the preserved frontend baseline.

## Main consolidation

The web JSON contract retains its date, hours, budget and location filtering. The restored `/api/events-map` renders the same cached preference search on Google Maps, displaying the first ten venue locations while the JSON/list retains all results. The Expo event screen shows categories, original listing links, advertised price ranges and the same fit/unknown-price disclosures. Browser maps prefer the dedicated `GOOGLE_MAPS_JS_KEY` and fall back to `GOOGLE_MAPS_DEMO_KEY`; never use the private Places/Routes credential in a map page.
