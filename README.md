# melloway

Less planning, more chemistry. A Sydney date and hangout phone app, migrated from the supplied HTML and Markdown prototypes (preserved in `prototype/`).

## Run locally

Use Node 22+ (tested on Node 24).

```sh
npm install
npm run dev
```

Open http://localhost:5173. This starts Vite and the server-only Google adapter on port 3001. Without credentials, the entire planning flow works using clearly labelled demo data. Maple Shore headings and Outfit body text load from the supplied local files in `public/fonts/`, with no Google Fonts dependency. External mood images and street-map tiles require an internet connection; neutral placeholders preserve the rest of the flow when they fail.

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

Playwright starts and stops the local app/API automatically. If you use an installed Chrome instead, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable. The suite uses demo data and local map-tile fixtures, without paid Google requests or requests to the public tile service. Tests cover the complete journey, swaps after reopening favourites, details and spotlight navigation, fresh drafts, save/delete persistence, community posts/likes, empty results, and 320px/390px viewports with reduced motion. These are Chromium viewport checks, not native iPhone or WebKit tests.

Verified: production build, 22 Node planner/provider/notes tests, and 31 Playwright tests. Google provider tests use synthetic responses to check request batching, route index mapping, unavailable edges and Sydney location search/resolution; real credentials were not used. Sydney timestamp tests cover seasonal offsets and clock-change boundaries.

The production build is `dist/`. Deploy to any static host with a SPA rewrite to `index.html`. To use live Google data, also host `server/index.js` in a Node service and reverse-proxy `/api/*` to it. The static build runs independently in demo mode. Do not deploy the Google adapter as an unrestricted public proxy: configure authentication, an origin allowlist and shared rate limiting for production. Its current IP rate limiter is suitable for a local hackathon demo, not distributed production traffic.

## Integrations

Copy `.env.example` to `.env` and configure only the providers you have.

### Google Maps Platform

Enable billing, Places API (New) and Routes API. Set `GOOGLE_MAPS_API_KEY` on the **server only**, restrict the key to those APIs and your server infrastructure. Never prefix it with `VITE_`. Discovery uses Text Search with geographic bias and requires known regular opening periods. Photos are fetched through a server proxy, with author names shown. Provider failures fall back to demo venues or explicit geographic travel estimates.

The introduction’s location field uses [Places Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) restricted to the Sydney region. Search is debounced and cancelled when the text changes; selecting a suburb, address or venue resolves its coordinates through [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details) using the same session token. Those coordinates centre nearby discovery and planning within 3 km. Without credentials or when search fails, suggestions are explicitly labelled local Sydney areas. Arbitrary text must be selected from suggestions before continuing; “anywhere in Sydney is good” leaves the area open. The API key stays on the server. `npm run dev` watches the API code for changes; restart it after configuring `.env`.

Live Places ratings and photos are provider-supplied. Prices and visit lengths remain labelled planning allowances. Regular hours do not guarantee holiday opening, reservations or event availability. Transit matrices are batched to stay within Google’s element limits and use the selected Sydney date/start time (including daylight saving). These are initial route estimates: later legs may have different departures, and future timetables can change. Walking/driving matrices use request-time routing. Confirm your actual outing route in Google Maps. Review Google Maps Platform attribution, storage and terms before a public launch; saved plans currently store venue snapshots for demonstration.

Directions always open Google Maps. For live Google Places results, optionally set a **separate public** `VITE_GOOGLE_MAPS_EMBED_KEY`, enable Maps Embed API, and restrict that key to the Embed API and your app’s HTTP referrers. This enables an embedded Google directions map with the selected stops and transport mode; without it, the route area links to Google Maps. The server’s discovery key is never copied into the client. See [Maps Embed documentation](https://developers.google.com/maps/documentation/embed/embedding-map). Google Places results are never plotted on non-Google tiles.

Demo plans use Leaflet and OpenStreetMap street tiles. The pink dotted line shows stop order with straight connections, not a calculated road route; demo coordinates remain sample locations. Nearby pins group their numbers so none are hidden and separate on zoom. The map preview leaves page scrolling available; “expand” opens a native full-screen dialog with pan, pinch zoom, keyboard controls, the stop list and directions. Escape or close restores focus and page scrolling. Tile failures keep the plan, details and save controls usable. Attribution remains visible beneath the map controls. Tile requests use browser caching and only fetch the visible area. `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION` and `VITE_MAP_TILE_ATTRIBUTION_URL` allow replacing the tile provider together. See [OpenStreetMap’s tile policy](https://operations.osmfoundation.org/policies/tiles/).

### Supabase

Set browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Run `server/schema.sql` in Supabase’s SQL editor and enable anonymous sign-ins. Row-level security ensures users access only their own itineraries. Never expose a service-role key. Favourites save locally first, with cloud sync when configured; sync failures are surfaced. Anonymous cloud ownership stays tied to that browser session; this MVP does not implement cross-device accounts. Configure CAPTCHA and sign-in rate limits before public use.

## Planner

Venue selection is separate from scheduling and optimisation. A bounded DFS searches paths of three to five stops across the best 14 candidates. It scores preference coverage and diversity, penalises travel, and prunes paths that violate budget, opening windows or duration. It is a bounded search, not a claim of global optimality. Live graph edges use Google Routes; demo edges use Haversine distances adjusted by mode and clearly marked as rough estimates. Driving includes a sample $15/person allowance; transit includes $10/person. These are budget allowances, not live fares.

The requested outing date selects opening-day schedules; start time and duration constrain visits. Demo hours are deliberately sample assumptions. Missing opening data is never treated as verified availability. Individual replacement reschedules the same ordered stops with one new venue, preserving the other venue identities. It refuses replacement when none is feasible.

## Screens and storage

Landing → name → age/gender → hanging out/location/budget → illustrated date idea → free-text notes → processing → editable route summary above the map, with individual venue cards below. Date, time and transport remain available within the hanging-out screen; multiselect interests are available beneath the suggestion carousel. Suggestions and recognised interests from notes contribute to planning. Notes remain attached to results; unrecognised requests, dietary requirements and bookings are not verified. Details expand, venues have spotlight pages, plans regenerate, directions open externally, and favourites persist across reloads. Reopened saved plans can swap a single stop directly: replacement candidates are reloaded on demand while preserving the rest of the plan. Starting a new plan clears the draft while keeping favourites. Ideas is a community feed with avatars, names, @handles and route posts. Each attached route has a numbered street-map preview, stop selection, a full-screen map and save/open actions. Search finds people, places and stops; filters show liked posts or your own posts. The composer attaches the current or a saved plan and keeps optional photos. Likes, posts and ratings are device-local; starter people/routes and all event ideas are fictional. Maps load as posts approach the viewport, and the feed loads separately from the introduction. What’s On uses tall original SVG event posters, organiser names and @handles, expandable details, search/category/liked/saved filters, and persistent local likes and bookmarks. Saved has separate routes/events tabs; saved posters reopen their own details. Planning around a poster adds its area and interests to the introduction. Event dates, times, venues and entry prices remain explicitly unconfirmed sample data. There is no public social backend or live events provider yet.

Personal profile answers stay in browser storage; no sign-up is required. No profile demographics influence recommendations. Clear browser storage to remove drafts and demo posts; remove favourites in the app. Profile, itinerary, local community and cloud storage are separate concerns.

## Phone app

The interface uses a phone-sized shell (up to 480px), including desktop previews. The introduction follows the supplied wireframe image: a centred Maple Shore logo and start button, separate conversational questions, floating doodles, an original illustrated suggestion carousel, a notes screen, simple loading, and a large expandable map above a rounded sheet with photo venue cards and bottom navigation. Outfit is used for body text and controls. Black and white carry the interface. Pink, yellow and green are reserved for small original illustrations and intermittent background doodles: an apple, matcha cup, flower, camera, sparkle and leaf, distributed across six background positions. Three motifs remain softly visible while three appear intermittently; all use gentle fades and drifts, remain behind content, and cannot intercept touches. They stop moving for reduced motion, hide while the keyboard is open, and pause when the page is hidden.

Motion uses short screen exits/entrances, short preset typewriter prompts, one active question at a time within the original screens, immediate chip feedback, touch-friendly carousel navigation, stage messages driven by actual discovery work, and local stop transitions. Age uses a wide number field with a numeric keyboard and a typing hint. Budget uses the same roomy field with a decimal keyboard, a dollar prefix and an AUD-per-person label; free/$40/$80/$120 shortcuts fill it in one tap. Custom amounts and cents persist, and blank or out-of-range values must be corrected before continuing or opening extra details. Continue moves from age to gender, then company, occasion, location and budget. Optional day/time/transport details and interest groups are also answered individually. An inline month calendar supports today/tomorrow shortcuts, past-day disabling and keyboard navigation. Time has morning/afternoon/evening shortcuts and hour/minute/am-pm selectors. Date and time can be cleared with “not sure yet” or skipped independently; blank answers stay blank across reloads, and generation uses today in Sydney and 11 am as the stated defaults. Back edits the previous question; reload preserves the current question and saved answers. Typing reserves the full prompt layout, finishes on input focus, and does not block answering or skipping. Returning with a saved name shows the complete script. Reduced motion removes movement, typing and staggering while keeping all six doodles static. Opening results shows an editable stop summary above the route map, followed by a rounded sheet of venue cards. Edit enables changing a chosen spot, moving it up/down, and removing it; at least one stop is retained. An add-stop picker searches the nearby candidate pool. Every edit reschedules the exact chosen order against opening hours, travel, outing duration and the full budget; infeasible changes preserve the existing plan. Totals, map labels, external directions and persisted plans update together, including one- and two-stop routes. Below the venue cards, optional photobooth/dessert/walk/bookshop suggestions show their allowance and added outing time. Adding one tries feasible insertion positions while preserving the order of the main stops. Extras never enter the route without a tap. The demo photobooth is explicitly a sample location; live extras use Google Places, with no invented live fallback. Search and category filters narrow the displayed cards while preserving the complete route, stop order and budget. Tapping a map tag selects its card; each card can highlight its stop on the map. The sheet handle scrolls between the map and cards. Tapping a summary stop or a card’s “the details” opens a native bottom-sheet dialog with timing, allowance and venue information. Escape and the close control dismiss it and return focus. Individual swaps remain available on collapsed cards. A lock-in button saves the plan, and a community link opens more ideas. Replacing one stop preserves the other stop components. The footer “m” opens saved plans, community and events through a native dialog; the result and secondary screens have bottom tabs, with “ur day” returning to the current itinerary. Keyboard opening keeps the introduction scrollable. Submit finishes the introduction, generates the outing, and navigates to the itinerary. Unexpected interruptions offer a retry that preserves the answers; impossible budgets/hours still require changing the details.

Safe-area spacing, native mobile form controls, accessible labels and chip states, 44px interaction targets, responsive navigation, and reduced-motion handling. Plan, replacement and community IDs remain valid UUID v4 on HTTP local-network previews, using `crypto.getRandomValues` when `crypto.randomUUID` is unavailable. The submit transition was also verified against the local-network origin, not only localhost. `capacitor.config.json` prepares the web build for Capacitor. No native iOS project was created. Add `@capacitor/ios` and run Capacitor on a configured macOS/Xcode environment when ready; Set `VITE_API_BASE_URL` to your HTTPS backend origin when packaged for iOS. Set the backend’s `APP_ORIGINS` to the exact Capacitor origins you use (typically `capacitor://localhost` on iOS and `http://localhost` on Android). The server uses an explicit CORS allowlist for those requests; no Google secret goes into the phone build.

## Structure

- `src/components`: shared controls, layout, expandable route map
- `src/pages`: app screens
- `src/hooks`: draft, current plan and favourites state
- `src/data`: prototype venues, demo coverage, preference taxonomy
- `src/services`: discovery, Google fallback orchestration, storage
- `src/utils`: selection, graph search, scheduling, directions
- `server`: Google API proxy and Supabase SQL
- `tests`: meaningful planner constraint and replacement tests

## Migration notes

Preserved: Outfit, expressive script branding (updated to the supplied Maple Shore font), exact pastel palette, pill controls, original doodles replacing outline bubbles, conversational tone, multi-select preferences, details, regeneration and DFS exploration. Refined: restored the screen boundaries and groupings from the supplied wireframe image, added subtle progress, and implemented the illustrated suggestion and free-text lock-in steps. HEYTEA informed visual restraint and branding; Inyo’s observed conversational reveals and touch responses informed interaction. Partner age/gender were removed as unnecessary collection; companion and optional partner name remain. The prototype’s theme-following CSS was replaced by the requested light lifestyle palette. The fake live-loading messages and “on today” badges were removed. The old save toggle is now persistence, and full-plan replacement is now single-stop replacement. Social scraping was excluded per the brief.
