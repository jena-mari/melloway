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
