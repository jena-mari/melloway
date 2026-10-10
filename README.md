# Melloway

**Less planning, more chemistry.** A Sydney-first date and hangout planner. The first React Native migration milestone lives in `apps/mobile/`; the existing React/Vite app, Node Google adapter and original prototypes remain available.

## Install

Use Node **22.13+** (Node 22 or 24 LTS recommended) and npm. From the repository root:

```sh
npm install
```

This installs all npm workspaces and builds `@melloway/domain`. Keep the root `package-lock.json`; do not create separate workspace lockfiles. Subsequent clean installs can use `npm ci`. Native dependencies should be added from `apps/mobile/` using `npx expo install <package>` so their versions match the Expo SDK.

## Run the Expo app

```sh
npm run mobile
```

Scan the Expo QR code with an SDK-compatible Expo Go on your phone (same network), or press `i`/`a` for a configured iOS simulator/Android emulator. You can also run `npm run ios --workspace @melloway/mobile` or `npm run android --workspace @melloway/mobile`. Those commands open Expo Go; they do not compile a native binary. To preview the React Native screens in a browser:

```sh
npm run mobile:web
```

Custom arguments are forwarded: `npm run mobile -- --clear`, or `npm run mobile:web -- --port 8081`. Full Xcode and an iOS simulator are required for local iOS testing; Android emulator tooling is required for local Android testing. Google Maps SDK credentials are required for standalone Android maps and Google Maps on standalone iOS. Use a development build when testing custom native configuration; do not equate a Metro bundle export with a successful native build.

The mobile app defaults to **demo mode** and needs no `.env`, Google credentials, Supabase project or running backend. Landing → profile (or skip) → date details → interests → generation → itinerary → venue spotlight is implemented. Per-person costs, arrival times, stop swaps, regeneration and device-local saved plans are available. Date/time text inputs show their required formats. Remote mood photos and map tiles need connectivity; photo placeholders, demo planning and bundled fonts remain available offline.

## Mobile environment

Optionally copy `apps/mobile/.env.example` to `apps/mobile/.env`. Expo loads variables from the app directory. Every `EXPO_PUBLIC_*` value is visible in the client bundle, so never put private keys there.

| Variable | Meaning |
| --- | --- |
| `EXPO_PUBLIC_DATA_MODE` | `demo` by default; `live` opts into the existing Google adapter, with a labelled demo fallback. |
| `EXPO_PUBLIC_API_URL` | Absolute server origin, e.g. `http://192.168.1.10:3001`, **without `/api`**. Required for live mode. |
| `GOOGLE_MAPS_ANDROID_KEY` | Optional native build-time Maps SDK key, restricted to Android package/signing identity. |
| `GOOGLE_MAPS_IOS_KEY` | Optional native build-time Maps SDK key, restricted to the iOS bundle identifier. |

Use your computer's LAN IP on a physical phone, `http://10.0.2.2:3001` in the Android emulator, or `http://localhost:3001` in the iOS simulator. A phone's `localhost` is the phone itself. For LAN testing, explicitly set root backend `HOST=0.0.0.0`; loopback remains the default. Restart Metro after environment changes. Native key/config changes require a rebuild. Production endpoints should use HTTPS. The server supports an explicit `APP_ORIGINS` CORS allowlist. Expo **web preview works in demo mode**; live web preview requires its exact origin in that allowlist or a same-origin reverse proxy.

The native map uses `react-native-maps`: Google Maps on Android; Apple Maps on iOS Expo Go without credentials. An app-restricted iOS key enables Google Maps in a rebuilt standalone/development app. Pins show stop locations only, with no fabricated road geometry. Actual directions open externally in Google Maps.

## Preserved web app and backend

```sh
npm run dev       # Vite :5173 and Node adapter :3001
npm run server    # Node adapter alone
npm run build    # Original web production build in dist/
npm run preview
```

The web app retains the latest illustrated introduction, free-text notes, map-first itinerary, saved-plan replacement, cancellation handling and Google provider validation from `main`. Its Maple Shore/Outfit fonts load locally; the Expo app uses Outfit/Yellowtail. To run the preserved web journey tests:

```sh
npm run test:e2e:setup
npm run test:e2e
```

Playwright starts and stops the local app/API automatically. If you use an installed Chrome instead, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable. The suite uses demo data and local map-tile fixtures, without paid Google requests or requests to the public tile service. Tests cover the complete journey, swaps after reopening favourites, details and spotlight navigation, fresh drafts, save/delete persistence, community posts/likes, empty results, and 320px/390px viewports with reduced motion. These are Chromium viewport checks, not native iPhone or WebKit tests.

Copy root `.env.example` to `.env` only when configuring providers. `GOOGLE_MAPS_API_KEY` belongs **only on the Node server** and must be restricted to Places API (New), Routes API and the server infrastructure. Do not prefix it with `VITE_` or `EXPO_PUBLIC_`. `PORT` defaults to 3001 and `HOST` to `127.0.0.1`. Keep Maps SDK client keys separate from the Places/Routes server key. The native adapter resolves server-relative photo URLs against the configured origin.

The web app uses Vite's `/api` development proxy. Production web deployments need SPA rewrites to `index.html` and a reverse proxy for `/api/*` when using live Google data. A packaged Capacitor app uses `VITE_API_BASE_URL` for its HTTPS backend origin and the backend's `APP_ORIGINS` allowlist for its exact origins. The static build works independently in demo mode. Before exposing the Node adapter publicly, add authentication and shared rate limiting; the existing local IP limiter is a demo implementation.

The original web community/events, local memories, likes/photos, favourites and optional Supabase sync remain implemented. Community starter posts/ratings and all event ideas are fictional. There is no public social backend or live events provider. No scraping, payments or AI has been added.

Directions always open Google Maps. For live Google Places results, optionally set a **separate public** `VITE_GOOGLE_MAPS_EMBED_KEY`, enable Maps Embed API, and restrict that key to the Embed API and your app’s HTTP referrers. This enables an embedded Google directions map with the selected stops and transport mode; without it, the route area links to Google Maps. The server’s discovery key is never copied into the client. See [Maps Embed documentation](https://developers.google.com/maps/documentation/embed/embedding-map). Google Places results are never plotted on non-Google tiles.

Demo plans use Leaflet and OpenStreetMap street tiles. The pink dotted line shows stop order with straight connections, not a calculated road route; demo coordinates remain sample locations. Nearby pins group their numbers so none are hidden and separate on zoom. The map preview leaves page scrolling available; “expand” opens a native full-screen dialog with pan, pinch zoom, keyboard controls, the stop list and directions. Escape or close restores focus and page scrolling. Tile failures keep the plan, details and save controls usable. Attribution remains visible beneath the map controls. Tile requests use browser caching and only fetch the visible area. `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION` and `VITE_MAP_TILE_ATTRIBUTION_URL` allow replacing the tile provider together. See [OpenStreetMap’s tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Supabase and database migrations

Existing web sync still uses browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with anonymous sign-ins and RLS. Never expose a service-role key. Anonymous ownership is tied to that browser session; native authentication and cross-device sync are future milestones. Local web favourites remain available when cloud sync fails. Native drafts/current plans/favourites use AsyncStorage and a separate `melloway.mobile.v1` namespace; browser data is not automatically imported.

`server/schema.sql` is preserved. New projects should apply the ordered files in `supabase/migrations/` instead: the existing private-itinerary schema, then the PostGIS extension foundation. **If you already applied `server/schema.sql`, baseline the initial migration rather than reapplying its policy.** No live database migrations were executed for this milestone. Venue/community schemas, geospatial queries, mobile Supabase Auth and Storage integration are still to be designed.

## Planner guarantees and limits

`packages/domain/` contains the TypeScript planner used by Expo, with regression checks against the original algorithm. The web app retains the newer JavaScript planner already on `main`, including input validation and overnight scheduling; reconciling those improvements into the shared package remains a follow-up. Both planners use bounded DFS for three to five stops from up to 14 candidates, with a 120,000-node cap. They score preference coverage/diversity, penalise travel and reject budget, opening-window, time-window or unavailable-edge violations. This is not a globally optimal search. Single-stop replacement reschedules the same ordered stops while preserving all other venue identities.

Demo edges use Haversine distance adjusted by travel mode and are explicitly rough estimates. Public transport includes a sample $10/person allowance and driving $15/person; those stay inside the budget and are not fare quotes. Demo hours are sample assumptions, including for named locations. Live Google Places ratings/photos are provider-supplied, while costs/visit lengths remain planning allowances. Opening hours do not guarantee holiday access, reservations or event availability. The Google adapter batches transit matrices and uses the selected Sydney date/start time, including daylight saving; later legs may depart at different times and future timetables can change. Walking/driving matrices use request-time routing. The starting area filters candidates; origin-to-first-stop and return travel are not scheduled yet. Confirm the actual outing route in Google Maps.

Review Google Maps Platform attribution/storage terms before public release; saved plans currently retain venue snapshots for demonstration. Reopened mobile saved plans need regeneration before a swap because candidate graphs are not stored with favourites.

## Validation

```sh
npm test                              # original constraints + migration + mobile API/config
npm run typecheck                     # shared domain and mobile TypeScript
npm run lint --workspace @melloway/mobile
npm run build                         # preserved Vite app
cd apps/mobile
npx expo install --check
npx expo-doctor
npx expo export --platform all         # iOS/Android/web JS bundles, not native binaries
```

See [docs/MIGRATION.md](docs/MIGRATION.md) for validation results, known limits and developer handoff. [docs/PRODUCT.md](docs/PRODUCT.md) records the product vision; [AGENTS.md](AGENTS.md) defines architecture and contribution conventions.

## Structure and team ownership

- `apps/mobile/src/app`: Expo Router navigation; `screens`, `components`, `theme.ts`: frontend styling, interaction and map polish.
- `apps/mobile/src/services`, `hooks`, `store`: platform adapters, asynchronous generation and device state.
- `packages/domain/src`: shared types, exact demo data, pure planner and provider-injected generation. Node/Vite consume built ESM; native Metro consumes TypeScript.
- `src`: preserved web screens/components/state/storage and the newer web planner/data/provider modules from `main`.
- `server`: preserved Node Google adapter and original Supabase SQL.
- `supabase/migrations`: versioned database foundation.
- `tests`: planner constraints, frozen-original parity and mobile provider/config boundaries.
- `prototype`: preserved original design references.

The backend developer can work on provider contracts, Supabase/PostGIS schemas, API validation, routing and planner tests. The frontend teammate can polish native screens, theme, reusable controls, animations, accessibility and map interactions independently of the planner. Agree on shared interfaces before changing them.

## Web app screens and storage

Landing → name → age/gender → hanging out/location/budget → illustrated date idea → free-text notes → processing → map-first itinerary with individual venue cards. Date, time and transport remain available within the hanging-out screen; multiselect interests are available beneath the suggestion carousel. Suggestions and recognised interests from notes contribute to planning. Notes remain attached to results; unrecognised requests, dietary requirements and bookings are not verified. Details expand, venues have spotlight pages, plans regenerate, directions open externally, and favourites persist across reloads. Reopened saved plans can swap a single stop directly: replacement candidates are reloaded on demand while preserving the rest of the plan. Starting a new plan clears the draft while keeping favourites. Community posts, optional photo uploads, ratings and likes are device-local; starter posts and all event ideas are fictional. There is no public social backend or live events provider yet.

Personal profile answers stay in browser storage; no sign-up is required. No profile demographics influence recommendations. Clear browser storage to remove drafts and demo posts; remove favourites in the app. Profile, itinerary, local community and cloud storage are separate concerns.

## Web interface and Capacitor

The interface uses a phone-sized shell (up to 480px), including desktop previews. The introduction follows the supplied wireframe image: a centred Maple Shore logo and start button, separate conversational questions, floating doodles, an original illustrated suggestion carousel, a notes screen, simple loading, and a large expandable map above a rounded sheet with photo venue cards and bottom navigation. Outfit is used for body text and controls. Black and white carry the interface. Pink, yellow and green are reserved for small original illustrations and intermittent background doodles: an apple, matcha cup and flower. Doodles alternate brief fades and gentle drifts with quiet intervals, remain behind content, and cannot intercept touches. They stop moving for reduced motion, hide while the keyboard is open, and pause when the page is hidden.

Motion uses short screen exits/entrances, a preset typewriter introduction on the name screen, staggered prompt reveals, immediate chip feedback, touch-friendly carousel navigation, stage messages driven by actual discovery work, and local stop transitions. Typing reserves the full prompt layout, finishes on input focus, and does not block answering or skipping. Returning with a saved name shows the complete script. Reduced motion removes movement, typing and staggering. Opening results shows the route map, rounded sheet and every venue photo. Search and category filters narrow the displayed cards while preserving the complete route, stop order and budget. Tapping a map tag selects its card; each card can highlight its stop on the map. The sheet handle scrolls between the map and cards. “Ur plan at a glance” expands the ordered summary; each card’s “the details” control reveals timing, allowance and venue information. Individual swaps remain available on collapsed cards. A lock-in button saves the plan, and a community link opens more ideas. Replacing one stop preserves other stop components and open detail state. The footer “m” opens saved plans, community and events through a native dialog; the result and secondary screens have bottom tabs, with “ur day” returning to the current itinerary. Keyboard opening keeps the introduction scrollable. Submit finishes the introduction, generates the outing, and navigates to the map-first itinerary. Unexpected interruptions offer a retry that preserves the answers; impossible budgets/hours still require changing the details.

Safe-area spacing, native mobile form controls, accessible labels and chip states, 44px interaction targets, responsive navigation, and reduced-motion handling. Plan, replacement and community IDs remain valid UUID v4 on HTTP local-network previews, using `crypto.getRandomValues` when `crypto.randomUUID` is unavailable. The submit transition was also verified against the local-network origin, not only localhost. `capacitor.config.json` prepares the web build for Capacitor. No native iOS project was created. Add `@capacitor/ios` and run Capacitor on a configured macOS/Xcode environment when ready; Set `VITE_API_BASE_URL` to your HTTPS backend origin when packaged for iOS. Set the backend’s `APP_ORIGINS` to the exact Capacitor origins you use (typically `capacitor://localhost` on iOS and `http://localhost` on Android). The server uses an explicit CORS allowlist for those requests; no Google secret goes into the phone build.
