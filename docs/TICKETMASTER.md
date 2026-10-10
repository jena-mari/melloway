# Fetch upcoming Sydney events

This standalone server module uses the official [Ticketmaster Discovery API v2](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/).
It makes one request for at most 10 Ticketmaster-source events in Sydney, Australia, starting between now and 30 × 24 hours from now, in date order. It does not backfill excluded results with further requests.

Create a developer account and obtain a Discovery API consumer key from the [Ticketmaster developer portal](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/).
Set `TICKETMASTER_API_KEY` in the server process environment, or add this line with your actual key to the ignored root `.env` file:

```dotenv
TICKETMASTER_API_KEY=your_actual_key
```

Keep it server-side. Do not use `VITE_` or `EXPO_PUBLIC_` variables, commit it, or paste it into frontend code.
From the repository root, with Node 22.13 or newer and dependencies installed:

```sh
npm run events:sydney
```

The runner prints a JSON array. Empty results are `[]`; a missing key, HTTP error, network failure, timeout or invalid response produces a safe error and exits with status 1. It never prints the request URL, provider error body or API key, and never substitutes demo events.

Each event includes `id`, `name`, `startDate` (local date), `startTime` (local time or null), `startDateTime` (provider timestamp with offset or null), `timezone`, `venue` (name, joined address, latitude, longitude), `category` (primary classification's segment, falling back to genre), original `url`, and `priceRanges` (min, max, currency).
Missing optional values are null. Price ranges are null when no numeric prices are supplied; explicit zero prices are preserved without labelling the event free. All provided ranges are retained rather than combining currencies.

Cancelled, postponed, date-TBA/date-TBD and missing/invalid-date events are excluded. Confirmed dates with unknown times remain included, with time fields null. Exact timestamps are checked against the rolling window; date-only events use Sydney calendar dates and cannot be filtered by an unknown hour. Venue timezone is used if event timezone is missing; no timezone or currency is invented.

Run mocked tests (no credentials and no real API calls):

```sh
npm run test:events
```

They are also included in `npm test`. To typecheck the standalone files:

```sh
npx tsc --noEmit --strict --module NodeNext --target ES2022 --types node --allowImportingTsExtensions --skipLibCheck server/ticketmaster.ts server/eventMap.ts scripts/fetch-sydney-events.ts tests/ticketmaster.test.ts tests/event-map.test.ts
```

## Venue map preview

The mobile app now has a **Ticketmaster venue map** button on its home screen, opening `/events-map`.
It uses the same Ticketmaster events, with no database or itinerary integration. Existing demo planning remains separate.

The Node server exposes `GET /api/events` (events, grouped venue pins, missing-coordinate count and map availability) and `GET /api/events-map` (an HTML Google JavaScript map).
The endpoints share a 60-second Ticketmaster snapshot and use the existing local request rate limit. The server makes no Google API requests for this preview.
The map labels every unique coordinate pair and fits all pins into view. Shared venue locations are grouped. It draws no route, performs no Places lookup and preserves Google's controls and attribution. Ticketmaster's coordinates can be inaccurate; missing coordinates are reported instead of guessed.

### No-card, zero-spend prototype setup

Use Google's [Maps Demo Key flow](https://developers.google.com/maps/demo-key), which supports JavaScript map rendering and markers without billing information. Click **Get a Demo Key**, sign in with your Google account and accept Google's Demo Key terms yourself. Do **not** attach a billing account or upgrade the Demo project. Usage pauses at the demo quota rather than charging; this key is for prototypes only.

Put only that dedicated Demo Key in the root ignored `.env`:

```dotenv
GOOGLE_MAPS_DEMO_KEY=your_actual_demo_key
APP_ORIGINS=http://localhost:8083
```

The map loads Google JavaScript in a browser frame on web and in the existing WebView on phones. `GOOGLE_MAPS_DEMO_KEY` is therefore **visible to map viewers**, even though it is configured on the server. Never substitute the private Ticketmaster or Places/Routes keys. `GOOGLE_MAPS_STATIC_KEY` is no longer used by the preview; the Maps Demo Key does not support Static Maps, and this prototype does not call it. The existing planner's Google adapter is independent; keep `EXPO_PUBLIC_DATA_MODE=demo` for planning without paid API calls.

Set the public server origin in `apps/mobile/.env.local` (this value is an address, never a secret):

```dotenv
EXPO_PUBLIC_DATA_MODE=demo
EXPO_PUBLIC_API_URL=http://localhost:3001
```

Start the backend and restart the Expo preview after setting environment variables:

```sh
npm run server
# In a second terminal:
npm run mobile:web -- --port 8083 --localhost
```

For a physical phone, use the computer's LAN IP instead of localhost and explicitly configure root backend `HOST=0.0.0.0` on a trusted local network. A browser needs its exact origin in `APP_ORIGINS`; native apps do not use browser CORS. The JavaScript map uses the already-installed WebView, without a Maps SDK key or a native rebuild.

Missing/rejected Demo Keys or script-loading failures preserve the Ticketmaster venue list and show an unavailable-map message. Each venue still has a Google Maps link, which requires no API key. No demo events or replacement coordinates are substituted. The planner remains usable in demo mode without any keys or backend; the live event screen still requires Ticketmaster credentials and the server. Restart the backend after editing keys.

Mocked map tests are included in `npm run test:events`; browser tests in `tests/mobile-e2e/events-map.spec.js` intercept Google JavaScript and verify all markers, fitted coordinates, missing/rejected keys, failed loading and refresh. They make no real Google API calls.
