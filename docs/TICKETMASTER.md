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

### Browser map keys

Add `GOOGLE_MAPS_JS_KEY=` to the **ignored root `.env`** used by the Node server and enter your real standard Maps JavaScript API key locally after `=`. The committed `.env.example` contains only an empty placeholder. Edit/add that single value; do not copy `.env.example` over an existing `.env`, overwrite other values, print the file, or commit it. Keep the existing server-only `TICKETMASTER_API_KEY` configured.

The server prefers a nonblank `GOOGLE_MAPS_JS_KEY`, trimming surrounding whitespace. A nonblank `GOOGLE_MAPS_DEMO_KEY` is an optional fallback **only when the standard key is blank/unset**. A rejected standard key does not silently switch to a Demo Key or issue another Google load. Restart the backend after editing either key.

Both are **browser map keys visible to map viewers at runtime** in the server-hosted HTML. The key is not returned by `/api/events`, but it is necessarily present in `/api/events-map` and the Google JavaScript request. Keep both separate from private Ticketmaster credentials and the server's `GOOGLE_MAPS_API_KEY` for Places/Routes. Neither private credential is a fallback. Do not add the key to `VITE_` or `EXPO_PUBLIC_` variables, native Maps SDK settings, app source or URLs you share.

The optional [Maps Demo Key](https://developers.google.com/maps/demo-key) remains a prototype configuration. A standard key uses its Google Cloud project's existing API/account configuration. This task does not upgrade billing, change quotas, add APIs or promise that a standard key has unlimited free usage. Keep the account on its unupgraded Free Trial; if Google refuses the request, keep the list fallback and inspect the error rather than upgrading or changing quotas.

### Google Console restrictions for the standard key

In **Google Cloud Console → APIs & Services → Credentials → your browser map key**:

1. **API restrictions:** choose **Restrict key**, allowing **Maps JavaScript API only**. The map uses only map rendering and markers; no Places, Routes, Geocoding, Static Maps or other API is needed.
2. **Application restrictions:** choose **Websites (HTTP referrers)**. Allow the origin of the **server-hosted map page**, including its protocol, host and port. For the default local backend, use `http://localhost:3001/*`; add `http://127.0.0.1:3001/*` only if opening the map through that hostname. For the isolated live check below, add `http://localhost:3002/*`.
3. Save and allow the restrictions to propagate before the single live check. If rejected, compare the browser console's reported referrer with these entries and correct the exact entry. **Keep restrictions enabled.** Do not remove them to fix an error.

The iframe is loaded from `http://localhost:3001/api/events-map?...` by default, or `http://localhost:3002/api/events-map?...` for the isolated check. Google sees that backend page's origin as its referrer. Merely allowing the outer Expo page (`http://localhost:8083`, `:8084`, or `:8086`) does not authorize the backend map page. Modern browsers may strip the path from cross-origin referrers, so use the origin with `/*`, not a restriction limited to `/api/events-map`.

`APP_ORIGINS` is a separate **server CORS** setting for the outer Expo browser origin; it does not configure the Google key. The server defaults to loopback. No deployed map domain is configured in this repository. If later hosted, explicitly allow the real HTTPS backend/map-page origin; do not invent or wildcard unrelated domains. For intentional LAN testing, allow the actual HTTP backend host/port used in `EXPO_PUBLIC_API_URL`, without relaxing restrictions. A WebView using a local file, inline HTML or a missing referrer may be rejected; use the existing HTTP(S) server-hosted page and verify in the browser rather than disabling restrictions.

References: [Google's API key security/restriction guidance](https://developers.google.com/maps/api-security-best-practices), [Maps JavaScript error messages](https://developers.google.com/maps/documentation/javascript/error-messages), and [authentication-failure callback](https://developers.google.com/maps/documentation/javascript/events#auth-errors).

### One isolated live map check

Install the existing locked dependencies with `npm ci` in the feature checkout. Keep the real keys in the existing ignored root `.env` you edited; the isolated worktree need not copy it. Use its absolute path for `--env-file-if-exists` below. Do not put keys in terminal arguments.

From the feature checkout, start the existing backend on a separate port in terminal 1:

```sh
HOST=127.0.0.1 PORT=3002 APP_ORIGINS=http://localhost:8086 \
  node --experimental-strip-types --env-file-if-exists=/absolute/path/to/your/root/.env server/index.js
```

In terminal 2, from the same checkout:

```sh
EXPO_PUBLIC_DATA_MODE=demo EXPO_PUBLIC_API_URL=http://localhost:3002 \
  npm run mobile:web -- --port 8086 --localhost --clear
```

Open `http://localhost:8086/events-map` **once**. It loads the Ticketmaster event list and one Google map from the backend on port 3002, using the current 60-second event snapshot. Check that every listed coordinate group has a labelled pin and that events lacking coordinates remain listed. The list is real Ticketmaster data; no demo events or invented points are substituted. Avoid repeatedly refreshing during this manual check. Close the preview when done. These ports keep the existing app/backend running; override neither existing process.

Planning stays in demo mode: this map check does not call the planner's Places/Routes adapter. It still requires the server's private Ticketmaster key. If there are no usable event coordinates, no map loads. A missing browser key leaves the list visible with a configuration message; Google authentication, loader/library errors or a 20-second loading timeout preserve the list with a map-failure message. The standalone map page reports authentication failures separately and suggests checking Maps JavaScript API access and website referrers. Each venue retains its original keyless Google Maps link.

### Mocked verification

`npm run test:events` covers key preference/fallback, missing/blank keys, separation from private keys, safe HTML rendering, authentication/library/timeout failures and the shared Ticketmaster snapshot. `tests/mobile-e2e/events-map.spec.js` mocks Google JavaScript, Ticketmaster endpoints and external Google Maps navigation; it checks pins, list preservation, both rejected key configurations and retry. No credentials or real Maps loads are required.

Validation for this change: all 115 tests in `npm test` passed (79 root, 5 mobile, 31 event/backend); domain/mobile typechecking, strict standalone event-file typechecking, mobile lint and the preserved Vite build passed. All 8 mocked map browser tests passed using a temporary port-only config on port 8087, removed afterwards. The key-selection tests cover the standard key alone, standard-key preference over Demo, blank/unset fallback, missing keys and exclusion of private server keys. There were no baseline failures.

No actual key, Google Console restriction, Free Trial status, real Ticketmaster request, real Maps load or real phone was tested or changed. The single manual check above is still required; automation deliberately uses fixtures only.
