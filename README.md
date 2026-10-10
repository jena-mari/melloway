# melloway

Less planning, more chemistry. A Sydney date and hangout phone app, migrated from the supplied HTML and Markdown prototypes (preserved in `prototype/`).

## Run locally

Use Node 22+ (tested on Node 24).

```sh
npm install
npm run dev
```

Open http://localhost:5173. This starts Vite and the server-only Google adapter on port 3001. Without credentials, the entire planning flow works using clearly labelled demo data. Maple Shore headings and Outfit body text load from the supplied local files in `public/fonts/`, with no Google Fonts dependency. External mood images require an internet connection; pastel photo backgrounds provide fallbacks.

```sh
npm test
npm run build
npm run preview
```

End-to-end tests are included in the repository. Install the test browser once, then run:

```sh
npm run test:e2e:setup
npm run test:e2e
```

Playwright starts and stops the local app/API automatically. If you use an installed Chrome instead, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable. The suite uses demo data and does not make paid Google requests. Tests cover the complete journey, swaps after reopening favourites, details and spotlight navigation, fresh drafts, save/delete persistence, community posts/likes, empty results, and 320px/390px viewports with reduced motion. These are Chromium viewport checks, not native iPhone or WebKit tests.

Verified: production build, 16 Node planner/provider tests, and 7 Playwright tests. Google provider tests use synthetic responses to check request batching, route index mapping and unavailable edges; real credentials were not used. Sydney timestamp tests cover seasonal offsets and clock-change boundaries.

The production build is `dist/`. Deploy to any static host with a SPA rewrite to `index.html`. To use live Google data, also host `server/index.js` in a Node service and reverse-proxy `/api/*` to it. The static build runs independently in demo mode. Do not deploy the Google adapter as an unrestricted public proxy: configure authentication, an origin allowlist and shared rate limiting for production. Its current IP rate limiter is suitable for a local hackathon demo, not distributed production traffic.

## Integrations

Copy `.env.example` to `.env` and configure only the providers you have.

### Google Maps Platform

Enable billing, Places API (New) and Routes API. Set `GOOGLE_MAPS_API_KEY` on the **server only**, restrict the key to those APIs and your server infrastructure. Never prefix it with `VITE_`. Discovery uses Text Search with geographic bias and requires known regular opening periods. Photos are fetched through a server proxy, with author names shown. Provider failures fall back to demo venues or explicit geographic travel estimates.

Live Places ratings and photos are provider-supplied. Prices and visit lengths remain labelled planning allowances. Regular hours do not guarantee holiday opening, reservations or event availability. Transit matrices are batched to stay within Google’s element limits and use the selected Sydney date/start time (including daylight saving). These are initial route estimates: later legs may have different departures, and future timetables can change. Walking/driving matrices use request-time routing. Confirm your actual outing route in Google Maps. Review Google Maps Platform attribution, storage and terms before a public launch; saved plans currently store venue snapshots for demonstration.

Directions always open Google Maps. The in-app route diagram is explicitly a schematic, not road geometry. The planning engine does not claim straight-line distances are actual routes.

### Supabase

Set browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Run `server/schema.sql` in Supabase’s SQL editor and enable anonymous sign-ins. Row-level security ensures users access only their own itineraries. Never expose a service-role key. Favourites save locally first, with cloud sync when configured; sync failures are surfaced. Anonymous cloud ownership stays tied to that browser session; this MVP does not implement cross-device accounts. Configure CAPTCHA and sign-in rate limits before public use.

## Planner

Venue selection is separate from scheduling and optimisation. A bounded DFS searches paths of three to five stops across the best 14 candidates. It scores preference coverage and diversity, penalises travel, and prunes paths that violate budget, opening windows or duration. It is a bounded search, not a claim of global optimality. Live graph edges use Google Routes; demo edges use Haversine distances adjusted by mode and clearly marked as rough estimates. Driving includes a sample $15/person allowance; transit includes $10/person. These are budget allowances, not live fares.

The requested outing date selects opening-day schedules; start time and duration constrain visits. Demo hours are deliberately sample assumptions. Missing opening data is never treated as verified availability. Individual replacement reschedules the same ordered stops with one new venue, preserving the other venue identities. It refuses replacement when none is feasible.

## Screens and storage

Landing → profile → location/budget/date/time/transport → interests → processing → itinerary. Details expand, venues have spotlight pages, plans regenerate, directions open externally, and favourites persist across reloads. Reopened saved plans can swap a single stop directly: replacement candidates are reloaded on demand while preserving the rest of the plan. Starting a new plan clears the draft while keeping favourites. Community posts, optional photo uploads, ratings and likes are device-local; starter posts and all event ideas are fictional. There is no public social backend or live events provider yet.

Personal profile answers stay in browser storage; no sign-up is required. No profile demographics influence recommendations. Clear browser storage to remove drafts and demo posts; remove favourites in the app. Profile, itinerary, local community and cloud storage are separate concerns.

## Phone app

The interface always uses a phone-sized app shell (up to 480px), including desktop previews. Bottom tabs switch between planning, community ideas, events and saved plans. Onboarding hides the tabs and keeps the continue action at the bottom; keyboard opening returns that action to the form so it does not cover inputs. The compact home screen puts both planning choices above the tabs on a 390×844 viewport. Plans use a vertical timeline, with save and route shortcuts near the top. Marketing-page sections were removed to keep the phone experience focused.

Safe-area spacing, native mobile form controls, accessible labels and chip states, 44px interaction targets, responsive navigation, and reduced-motion handling. `capacitor.config.json` prepares the web build for Capacitor. No native iOS project was created. Add `@capacitor/ios` and run Capacitor on a configured macOS/Xcode environment when ready; Set `VITE_API_BASE_URL` to your HTTPS backend origin when packaged for iOS. Set the backend’s `APP_ORIGINS` to the exact Capacitor origins you use (typically `capacitor://localhost` on iOS and `http://localhost` on Android). The server uses an explicit CORS allowlist for those requests; no Google secret goes into the phone build.

## Structure

- `src/components`: shared controls, layout, route schematic
- `src/pages`: app screens
- `src/hooks`: draft, current plan and favourites state
- `src/data`: prototype venues, demo coverage, preference taxonomy
- `src/services`: discovery, Google fallback orchestration, storage
- `src/utils`: selection, graph search, scheduling, directions
- `server`: Google API proxy and Supabase SQL
- `tests`: meaningful planner constraint and replacement tests

## Migration notes

Preserved: Outfit, expressive script branding (updated to the supplied Maple Shore font), exact pastel palette, pill controls, orb/heart motifs, conversational tone, multi-select preferences, details, regeneration and DFS exploration. Refined: consolidated introduction and added clear progress. Partner age/gender were removed as unnecessary collection; companion and optional partner name remain. The prototype’s theme-following CSS was replaced by the requested light lifestyle palette. The fake live-loading messages and “on today” badges were removed. The old save toggle is now persistence, and full-plan replacement is now single-stop replacement. Social scraping was excluded per the brief.
