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


## Phone runtime correction — restore SDK 57

Status: COMPLETE — code restored; real-phone retry pending

The user requested reverting the SDK 54 downgrade. The phone connection log confirms: “The installed version of Expo Go is for SDK 57.0.0.” The earlier SDK 54 guidance was incorrect for this device.

Only compatibility commit `199df95` is reverted on the existing `app-usability-v1` branch. SDK 57, React Native 0.86.3, shared React 19.2.3, the original dependency lockfile and Expo configuration are restored; the SDK 54 Babel configuration is removed. Event details and itinerary sharing stay intact. The discovery checkout and its uncommitted venue-video work remain untouched. No new branch, feature, merge or paid service.

Verification after restoration:

- Exact source/configuration/lockfile equality with pre-downgrade commit `0fc1951`, except this correction record.
- `npm ci --no-audit --no-fund` passed; SDK 57.0.27 / React Native 0.86.3 / React 19.2.3 installed.
- `npm test`: 125 passed (79 root, 20 mobile, 26 backend/event), zero failures.
- Domain/mobile typecheck, mobile lint and preserved Vite build passed.
- `CI=1 npx expo install --check --json`: passed; no automatic fixes.
- Expo Doctor: 21/21 passed.
- Fresh all-platform export: iOS, Android and web bundles passed.
- 23 unchanged mocked browser regressions passed (11 event-map, 4 sharing, 8 social-link).
- Manual browser checks passed: landing → onboarding → details/vibes → generation → itinerary → venue, save/reload, regeneration, successful swap, unavailable-swap feedback, and no-feasible-plan feedback.
- No secrets, generated native projects or unrelated feature edits in the revert.

The SDK 57 phone demo server runs on port 8085 with a cleared cache; the existing browser preview uses port 8084. Commands from this worktree:

```sh
EXPO_PUBLIC_DATA_MODE=demo npm run mobile -- --port 8085 --lan --clear
EXPO_PUBLIC_DATA_MODE=demo EXPO_PUBLIC_API_URL=http://localhost:3001 npm run mobile:web -- --port 8084 --localhost --clear
```

No native binary, live provider requests, actual shares or bookings were tested. Real-device startup and the original RCTEventEmitter error still need checking after rescanning. This restoration removes the confirmed SDK mismatch; compiler/browser checks do not establish that every native startup issue is resolved.

The restoration is published as a normal commit on the existing usability draft PR #3. No reset, force-push, merge, new branch or edits to the discovery checkout.
