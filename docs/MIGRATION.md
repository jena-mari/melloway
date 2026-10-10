# First Expo migration milestone

## Original architecture

The repository was a React 19/Vite single-page app with React Router, CSS/Tailwind, Framer Motion and Lucide. `src/pages/` contained landing, three onboarding steps, generation, itinerary, venue spotlight, favourites and fictional community/events. `src/hooks/useApp.jsx` held context state and browser-local persistence. `src/services/` provided browser-relative Google API discovery and optional anonymous Supabase sync. `src/utils/planner.js` implemented candidate selection, Haversine travel estimates, weekday-aware scheduling, bounded DFS, single-stop replacement and external Google Maps URLs. `src/data/` held the Sydney taxonomy and demo venues. `server/index.js` was a dependency-light Node HTTP Google adapter; `server/schema.sql` created private itineraries with RLS. Nine Node tests protected planner constraints. Capacitor configuration existed; no native app had been built.

## Migration and preservation

- Added `apps/mobile/` with Expo SDK 57, React Native 0.86, strict TypeScript, Expo Router, Reanimated, Gesture Handler, Zustand, TanStack Query and AsyncStorage.
- Recreated landing, profile onboarding, outing details/interests, generation, itinerary and venue spotlight using native components and the same palette/fonts/tone. Added basic device-local saved plans, regeneration and single-stop replacement.
- Moved the planner, preferences and exact demo venue dataset to `packages/domain/`. Kept old import paths through small JS compatibility re-exports; web generation delegates to shared orchestration. No DOM/CSS was copied into native screens.
- Preserved algorithm search order, scoring, search caps, pruning, transport allowances, hours, replacement and route-URL behaviour. Regression tests compare complete outputs with the frozen original planner.
- Kept all web screens, prototypes, community/events, local/cloud storage and Capacitor configuration. Retained Node endpoints and Google request logic; only added an optional `HOST` bind setting for physical-device access.
- Added typed existing API contracts and a native absolute-origin adapter (including relative photo URL resolution and null/unreachable matrix edge handling). Default native demo mode makes no backend requests.
- Added a native map with ordered pins and a web fallback. No synthetic polylines are represented as actual directions. Google Maps is used on Android; iOS uses Apple Maps in Expo Go and can use Google Maps in a development/release build with an iOS SDK key.
- Added versioned Supabase migrations preserving the existing schema and enabling PostGIS. These files have not been applied to a live database. Mobile auth/cloud sync remain future work.

## Project structure

```text
apps/mobile/
  src/app/                 Expo Router routes and layout
  src/screens/             native planning flow, venues and saved plans
  src/components/          native UI, screen shell, platform map
  src/theme.ts             visual tokens and typography
  src/store/               Zustand + AsyncStorage device persistence
  src/hooks/               TanStack Query generation
  src/services/            mobile config, HTTP providers, generation adapter
packages/domain/src/       shared types, data, pure planner, orchestration
src/                       preserved React/Vite web application
server/                    preserved Google adapter and original SQL
supabase/migrations/       versioned itinerary schema and PostGIS foundation
tests/                     original planner, migration parity, mobile API/config
docs/                      product vision and migration handoff
prototype/                 original design references
```

## Working features and limits

Native demo planning supports date/hangout mode, profile (or skipping it), starting area, validated date/time, budget, transport, duration, interests, ordered stop times/costs, basic venue details, swaps, regeneration and saved plans on this device. Native map tiles and illustrative remote photos need connectivity; photos have a pastel fallback. The planner/demo data/fonts are local. Date/time fields use native text input with explicit formats; native picker polish is a frontend follow-up.

Reopened saved plans can be viewed immediately; regenerate before swapping because saved snapshots do not retain the candidate graph. Starting area is not GPS/address routing, and the demo plan excludes origin-to-first-stop and return travel. Supabase mobile authentication/sync, public community, photos/video submission, real events, verified opening exceptions and live directions geometry are incomplete. NativeWind is deferred because StyleSheet already covers the initial visual system. Server TypeScript conversion is deferred to preserve the existing backend. Development/release native Google Maps needs app-restricted SDK credentials and a rebuild.

## Validation

Completed checks:

- `npm install` succeeded; one React 19.2.3 installation is shared by both apps. The root lockfile is synchronized.
- `npm test`: **18 passing tests** — the 9 original constraints, 6 migration/domain tests and 3 mobile configuration/provider tests. Full plan, candidate, matrix, replacement, regeneration and directions output matches the frozen JavaScript algorithm across the regression scenarios.
- `npm run typecheck`: shared package and mobile pass strict TypeScript checks.
- `npm run lint --workspace @melloway/mobile`: passes with no errors or warnings.
- `npm run build`: preserved Vite production build succeeds.
- `npx expo install --check`: installed versions match the SDK. The initial local check reported offline validation; the subsequent online `npx expo-doctor` passed **21/21 checks**.
- `npx expo export --platform all`: iOS/Android Hermes bundles and the web bundle export successfully.
- Expo Metro starts successfully. Manual browser-preview checks covered landing, profile entry/skip, date/hangout mode, details/vibes, demo generation, stop costs/arrival times, venue spotlight/back, saving/reloading/reopening, a single-stop swap preserving other venue identities, and regeneration. A 23:30 start correctly shows the no-feasible-plan message and offers preference changes.
- Preserved web flow also reaches a demo itinerary. Default preferences give the same 4-stop, $40, 3h40m result in both apps. The running Node adapter returns its expected HTTP 503 JSON response without Google credentials.
- `git diff --check` passes. Work remains on `codex/expo-mobile-migration`; nothing was pushed or merged.

JavaScript bundle export is distinct from a successful native build. This machine has Xcode command-line tools but no full Xcode/simulator; neither a native iOS nor Android binary has been built or tested. Native map gestures/callouts, native AsyncStorage, real Google discovery/routes, app-restricted Google Maps SDK setup and Supabase migrations have not been exercised on a device or live service.

The installation audit reports **29 dependency findings (10 moderate, 19 high)**, propagated from `braces`, `decode-uri-component`, `node-forge` and `uuid` in the current SDK/tooling tree. npm's proposed fixes include incompatible SDK/native downgrades or a prerelease Router major; no forced dependency changes were applied. Review upstream patches and their compatibility before release. Expo Doctor compatibility checks are not a security audit.

## Backend developer next steps

1. Test the native Google adapter against the existing server with an absolute LAN endpoint and separate server/Maps SDK keys. Add runtime request/response validation and production auth/rate limits before exposing the adapter.
2. Review and baseline the itinerary migrations, then design PostGIS venue tables, durable provider IDs, opening exceptions and community metadata. Do not run the preserved initial policy migration twice.
3. Define Supabase Auth and Storage contracts for native identity, account ownership, photo uploads and cross-device itinerary sync. Use a dedicated token storage strategy; the profile store is not secure token storage.
4. Add actual origin/finish constraints, future-date transport information and provider contract tests before changing DFS optimisation. Build measurable itinerary-quality fixtures first.
5. Migrate the Node adapter to TypeScript incrementally against the shared types, retaining endpoint behaviour.

## Frontend teammate next steps

Work in `apps/mobile/src/screens/`, `components/` and `theme.ts`. Refine native date/time input, keyboard handling, accessibility/large text, animations and image/layout polish. Test map gestures, callouts and loading/failure states on real iOS/Android devices. Replace starter icon assets with reviewed Melloway artwork before store builds. Use shared types and the existing generation hook/store interfaces; keep recommendation logic and integrations outside UI. Coordinate Google iOS/Android development build configuration with the backend developer.
