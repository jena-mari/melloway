# Usability progress

## Extra chunk 1 — Useful event details

Status: COMPLETE

Isolated branch: `app-usability-v1`, based on `expo-mobile-migration` at `2607f60`.
Worktree: `/Users/shana/.codex/worktrees/app-usability-v1/melloway`.
The discovery branch and its six uncommitted venue-video files remain untouched in the original checkout.

### Result

The existing event-map venue cards now show each event's name, supplied local date/time and timezone, category when supplied, and advertised price ranges with their supplied currencies. Events without coordinates use the same detail renderer.

Missing prices say **Price unavailable**. Zero is displayed numerically, never labelled free. Partial price bounds remain explicit; absent currency says **currency unavailable**. No currency, booking fees or ticket availability are inferred. Dates are not converted using the viewer's timezone; missing time says **Time unconfirmed**.

**View event / tickets** opens the original HTTP(S) listing, preserving its query parameters. Missing, unsupported and malformed URLs have no button. Rejected or throwing link openers show an error and allow retry without crashing. Map behavior, venue grouping, existing controls and theme remain intact.

Formatting and URL validation live in a small native-independent utility; there are no new dependencies, APIs, endpoints, routes, database changes, bot changes or bookings.

### Verification

All checks passed in the isolated worktree:

- `npm test`: 116 tests passed (79 existing root tests, 11 mobile tests including 6 new event-detail tests, 26 existing event/backend tests).
- `npm run typecheck`: domain and mobile passed.
- `npm run lint --workspace @melloway/mobile`: passed.
- `npm run build`: passed.
- 11 mocked event-map browser tests passed, including the 7 existing map regressions and 4 new detail/link tests.
- Diff checked for whitespace errors, credentials and unrelated changes. Only the five files listed below are committed.

Browser command:

```sh
CI=1 PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test --config playwright.mobile.config.js tests/mobile-e2e/events-map.spec.js
```

The first browser attempt could not launch because the Playwright browser binary was absent; the rerun used installed Chrome and passed without weakening any tests or changing dependencies. The test app ran separately on port 8084. Ticketmaster, Google Maps and external listing responses were mocked, including popup navigation. No real API calls, paid requests or bookings were made. The user's app and backend were not restarted.

### Changed files

- `apps/mobile/src/screens/EventMapScreen.tsx`
- `apps/mobile/src/services/eventDetails.ts`
- `tests/mobile/event-details.test.ts`
- `tests/mobile-e2e/events-map.spec.js`
- `docs/USABILITY_PROGRESS.md`

### Limits and stop point

Not tested on a real iOS/Android device or in Expo Go. No real Ticketmaster listings, current ticket availability, actual booking behavior or device browser handoff were tested. Browser opening is handled through the existing React Native Linking API; platform failures are tested with mocks.

Official references consulted: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and [React Native Linking](https://reactnative.dev/docs/linking), plus the installed Linking types and web implementation.

This checkpoint is complete. No subsequent chunk, push, merge or deployment was performed.


## Extra chunk 2 — Share an itinerary as text

Status: COMPLETE

Chunk 1 passed. Work continued only in the same isolated `app-usability-v1` worktree.

### Result

One **Share this plan** button opens React Native's built-in share sheet with a single text message, only after an explicit press. The existing itinerary controls, design, saved plans and planning behavior remain intact. The button stays busy while sharing is open. Cancellation is quiet; a failure shows a helpful error and allows retry. No success message claims that a recipient received anything.

A separate pure TypeScript formatter produces the Melloway heading, outing date, ordered venue names/arrival times, transport mode, estimated spending per person in the app's existing AUD currency, venue map links when usable, and brief demo/estimate disclaimers. Overnight arrivals indicate the following day. Missing date/time/cost/transport data stays explicitly unavailable. Valid venue coordinates produce venue-only links; a supplied HTTP(S) venue map link is used when coordinates are absent, excluding credential-bearing links and origin/waypoint routes.

The formatter allowlists fields rather than serializing a plan: profile names, ages, genders, companion details, interests, private notes, personal starting addresses and free-form notices are excluded. No automatic sending, public plan links, hosted pages, accounts, posting integrations or collaboration features were added. No dependency, route, storage, database or provider changes were made.

### Verification

All checks passed; there were no pre-existing test failures:

- `npm test`: 125 tests passed (79 existing root tests, 20 mobile tests including 9 new sharing/formatting tests, 26 existing event/backend tests).
- `npm run typecheck`: domain and mobile passed.
- `npm run lint --workspace @melloway/mobile`: passed.
- `npm run build`: passed (preserved Vite application).
- 15 mocked mobile browser tests passed: 4 new sharing tests and all 11 event-map regressions.

Browser command:

```sh
CI=1 PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test --config playwright.mobile.config.js tests/mobile-e2e/share-plan.spec.js tests/mobile-e2e/events-map.spec.js
```

Unit tests cover exact text formatting, privacy exclusions, unchanged input, missing optional fields, invalid maps, midnight/overnight times, demo/estimate disclaimers, success, iOS dismissal, Web Share cancellation and failures. Browser tests confirm no share before a press, a text-only payload, a busy button, quiet cancellation, helpful failure/retry, unchanged saved-plan storage and no share button without a plan. Share calls and external requests were mocked; nothing was actually sent. The separate test app used port 8084; the user's app/backend were not restarted.

### Changed files in this checkpoint

- `apps/mobile/src/screens/ItineraryScreen.tsx`
- `apps/mobile/src/services/itineraryText.ts`
- `apps/mobile/src/services/sharePlan.ts`
- `tests/mobile/share-plan.test.ts`
- `tests/mobile-e2e/share-plan.spec.js`
- `docs/USABILITY_PROGRESS.md`

### Real-phone limitations and publication

Still to test on real iOS/Android phones: opening the native share sheet in Expo Go, dismissing/reopening it, supported target apps and the final appearance of text/map links in those apps, plus accessibility/large-text behavior. No native build, device share or recipient delivery was tested. Android's built-in Share result cannot establish delivery or distinguish dismissal; the app makes no delivery claim. Web sharing depends on browser support.

Official references consulted: [React Native 0.86 Share](https://reactnative.dev/docs/0.86/share), [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), and the installed Share types/web implementation.

Repository push permission was confirmed. This checkpoint authorizes publishing only `app-usability-v1` and a draft PR targeting `expo-mobile-migration`, containing chunks 1 and 2. Publication outcome is reported with the task; no merge, force-push or deployment is authorized. Discovery and its uncommitted files remain untouched. Stop after this checkpoint.


## Phone compatibility follow-up — App Store Expo Go

Status: COMPLETE — implementation and automated checks; real-phone retry pending

The user approved aligning the app with SDK 54 after an immediate iPhone startup error and confirmed App Store Expo Go. The fix stays on the existing `app-usability-v1` branch and worktree, with no additional branch. Expo's [compatibility documentation](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) states that the physical iPhone App Store runtime supports SDK 54; this checkout previously targeted SDK 57.

The native dependency versions are taken from the official Expo 54 package's `bundledNativeModules.json`. React is kept at one shared version across both apps. SDK 54 uses the platform Google Maps configuration fields rather than newer Maps/StatusBar plugins. There are no new features, paid builds, billing changes, database changes or dependency changes in the discovery checkout.

### Changes

- SDK 54 / React Native 0.81.5 / shared React 19.1.0, matching native package versions and TypeScript 5.9.
- SDK 54 platform map configuration fields; no unsupported Maps/StatusBar config plugins.
- Expo's [documented SDK 54](https://expo.dev/changelog/sdk-54) `unstable_transformImportMeta` Babel option for the existing Zustand ESM middleware. No screen, route, store, provider or algorithm changes.
- Root lockfile regenerated for correct workspace placement; unrelated direct dependencies and Rollup stay at their previous versions.

Files changed: `package.json`, `package-lock.json`, `apps/mobile/package.json`, `apps/mobile/app.config.ts`, `apps/mobile/babel.config.js`, `AGENTS.md`, `apps/mobile/AGENTS.md`, `README.md`, and this progress file.

### Verification

- `npm test`: 125 passed (79 root, 20 mobile, 26 backend/event tests), no failures.
- `npm run typecheck`: domain and mobile passed.
- `npm run lint --workspace @melloway/mobile`: passed.
- `npm run build`: preserved Vite app passed.
- `CI=1 npx expo install --check --json`: passed, no outdated dependencies; JSON/CI mode cannot apply automatic fixes.
- `npx expo-doctor`: 18/18 passed.
- `npm ls expo react-native react --all`: passed, one SDK 54 runtime / React Native 0.81.5 / shared React 19.1.0.
- `npx expo export --platform all --clear --output-dir /private/tmp/melloway-sdk54-export-cleared`: fresh iOS, Android and web bundles passed.
- 23 existing browser regressions passed: 11 event-map, 4 sharing, 8 social-link tests. Providers, external listing links and sharing are mocked; nothing was sent or booked.
- Manual browser flow passed: home → skip introduction → details/vibes → demo generation → itinerary → venue; saving/reloading, regeneration, stop swap, and a zero-budget late-night no-feasible-plan case.

The initial workspace install left a mixed SDK dependency tree; clean lockfile generation corrected it. Browser regressions exposed SDK 54's missing opt-in import.meta transform. The documented Babel option plus a Metro cache reset corrected it; all existing tests were preserved. Interactive install-check commands were rejected by automatic approval review; inspected CLI source confirmed `--json` exits before its fix path, and that read-only command passed.

Browser regression command (uses the separately running, cleared SDK 54 server on port 8084):

```sh
EXPO_PUBLIC_DATA_MODE=demo EXPO_PUBLIC_API_URL=http://localhost:3001 npm run mobile:web -- --port 8084 --localhost --clear
PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test --config playwright.mobile.config.js tests/mobile-e2e/share-plan.spec.js tests/mobile-e2e/events-map.spec.js tests/mobile-e2e/social-link.spec.js
```

Phone demo command from this worktree:

```sh
EXPO_PUBLIC_DATA_MODE=demo npm run mobile -- --port 8085 --lan --clear
```

Close/reopen App Store Expo Go, then scan this server's QR using the iPhone Camera; phone and Mac must share Wi-Fi. No Expo account, Apple membership or paid build is required for this demo flow. The original SDK 57 server on port 8083 remains separate; scanning its QR will still target SDK 57.

### Limits

Real iPhone/Android startup, native map rendering, native share sheets and actual video provider behavior remain unverified. Full Xcode is unavailable, and no native binary was built. Native bundle exports are compiler checks, not device tests. The phone server uses demo data; event/backend access needs a device-reachable backend address and is not established by this startup fix. No real discovery, paid API or booking requests were made.

The original discovery checkout and all six uncommitted venue-video files remain preserved. This follow-up is kept with usability PR #3 targeting `expo-mobile-migration`; no new branch, merge or deployment.
