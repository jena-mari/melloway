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

Use your computer's LAN IP on a physical phone, `http://10.0.2.2:3001` in the Android emulator, or `http://localhost:3001` in the iOS simulator. A phone's `localhost` is the phone itself. For LAN testing, explicitly set root backend `HOST=0.0.0.0`; loopback remains the default. Restart Metro after environment changes. Native key/config changes require a rebuild. Production endpoints should use HTTPS. The adapter currently has no CORS configuration: the Expo **web preview is supported in demo mode**, while live mode is intended for native clients or a correctly configured same-origin/reverse-proxy web deployment.

The native map uses `react-native-maps`: Google Maps on Android; Apple Maps on iOS Expo Go without credentials. An app-restricted iOS key enables Google Maps in a rebuilt standalone/development app. Pins show stop locations only, with no fabricated road geometry. Actual directions open externally in Google Maps.

## Preserved web app and backend

```sh
npm run dev       # Vite :5173 and Node adapter :3001
npm run server    # Node adapter alone
npm run build    # Original web production build in dist/
npm run preview
```

Copy root `.env.example` to `.env` only when configuring providers. `GOOGLE_MAPS_API_KEY` belongs **only on the Node server** and must be restricted to Places API (New), Routes API and the server infrastructure. Do not prefix it with `VITE_` or `EXPO_PUBLIC_`. `PORT` defaults to 3001 and `HOST` to `127.0.0.1`. Keep Maps SDK client keys separate from the Places/Routes server key. The native adapter resolves server-relative photo URLs against the configured origin.

The web app uses Vite's `/api` development proxy. Production web deployments need SPA rewrites to `index.html` and a reverse proxy for `/api/*` when using live Google data. The static build works independently in demo mode. Before exposing the Node adapter publicly, add authentication, an origin policy and shared rate limiting; the existing local IP limiter is a demo implementation.

The original web community/events, local memories, likes/photos, favourites and optional Supabase sync remain implemented. Community starter posts/ratings and all event ideas are fictional. There is no public social backend or live events provider. No scraping, payments or AI has been added.

## Supabase and database migrations

Existing web sync still uses browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with anonymous sign-ins and RLS. Never expose a service-role key. Anonymous ownership is tied to that browser session; native authentication and cross-device sync are future milestones. Local web favourites remain available when cloud sync fails. Native drafts/current plans/favourites use AsyncStorage and a separate `melloway.mobile.v1` namespace; browser data is not automatically imported.

`server/schema.sql` is preserved. New projects should apply the ordered files in `supabase/migrations/` instead: the existing private-itinerary schema, then the PostGIS extension foundation. **If you already applied `server/schema.sql`, baseline the initial migration rather than reapplying its policy.** No live database migrations were executed for this milestone. Venue/community schemas, geospatial queries, mobile Supabase Auth and Storage integration are still to be designed.

## Planner guarantees and limits

`packages/domain/` contains the single TypeScript planner used by both apps. Venue selection and scheduling are separate. Bounded DFS explores three to five stops from up to 14 candidates, with a 120,000-node cap. It scores preference coverage/diversity, penalises travel and rejects budget, opening-window, time-window or unavailable-edge violations. It is not a globally optimal search. Single-stop replacement reschedules the same ordered stops while preserving all other venue identities.

Demo edges use Haversine distance adjusted by travel mode and are explicitly rough estimates. Public transport includes a sample $10/person allowance and driving $15/person; those stay inside the budget and are not fare quotes. Demo hours are sample assumptions, including for named locations. Live Google Places ratings/photos are provider-supplied, while costs/visit lengths remain planning allowances. Opening hours do not guarantee holiday access, reservations or event availability. Route matrices reflect request-time routing, not guaranteed future-date transit timetables. The starting area filters candidates; origin-to-first-stop and return travel are not scheduled yet. Confirm the actual outing route in Google Maps.

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
- `src`: preserved web screens/components/state/storage; planner and data compatibility exports.
- `server`: preserved Node Google adapter and original Supabase SQL.
- `supabase/migrations`: versioned database foundation.
- `tests`: planner constraints, frozen-original parity and mobile provider/config boundaries.
- `prototype`: preserved original design references.

The backend developer can work on provider contracts, Supabase/PostGIS schemas, API validation, routing and planner tests. The frontend teammate can polish native screens, theme, reusable controls, animations, accessibility and map interactions independently of the planner. Agree on shared interfaces before changing them.
