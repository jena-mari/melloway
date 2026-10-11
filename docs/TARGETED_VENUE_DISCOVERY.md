# Targeted venue discovery

The existing request contract is unchanged: `POST /api/venues` accepts `{ prefs }`.
Free-text activities come from `prefs.notes`, for example `I want a skate park`.
The Explore search box remains its existing local filter; this task adds no UI.

## Query budget and matching

A deterministic parser extracts up to four affirmative activity phrases, including
facilities outside the preference-tag vocabulary. Negative requests and generic
outing/vibe prose are ignored. It does not call AI. This is a conservative phrase
parser, not arbitrary natural-language understanding.

Eligible curated places are checked first using actual name/category evidence,
the chosen location radius, budget allowance and a fitting opening window. If any
explicit activity is unmet, only the first unmet activity gets **one additional
Places Text Search**. Existing category searches remain (up to four, or three
fallback categories). No pagination, automatic retry or extra Place Details call
is added. Named research resolution does not run targeted activity searches.
A later user request can issue another search; this is a per-request bound, not
a billing quota. No live provider call was made during implementation/tests.

Google results require a nonempty ID/name/address, operational status when supplied, Sydney
coordinates within the selected radius and a physical venue. Targeted matches
require actual provider types or venue-name evidence; assigning a query tag does
not establish a match. For known types such as `skateboard_park`, the targeted
request also uses strict type filtering. Other phrases are matched conservatively.
A public outdoor facility can omit business status; explicit closures still reject it.
No result is fabricated to fill the pool.

Explicit activity matches receive scoring/shortlist priority and must satisfy
exact activity coverage in a confirmed matching itinerary. Other stops keep the
existing mixed curated + Google pool and curated representation. Existing
closest-match fallback still describes missing requests as alternatives.

## Price and opening evidence

Places `priceLevel` is coarse, not a price quote. Conservative AUD per-person
planning allowances are 20/45/90/150 for inexpensive/moderate/expensive/very
expensive, never below the existing category allowance. A supplied free price
level allows zero; a missing level on a requested activity gets a **nonzero**
allowance (20 outdoors, 35 otherwise). Total, transport and category budget
allowances are checked. These estimates do not verify admission, equipment hire,
fees or current ticket availability; the venue must be checked before visiting.

Malformed weekly periods are discarded. Requested places with known weekly hours
must have a fitting window for the selected date/time. Missing/invalid hours
exclude indoor or uncertain facilities. A genuinely outdoor type (or explicit
outdoor venue-name evidence) can remain as a suggestion with seven empty daily
windows, `hoursStatus: "unverified"`, and a caution in `note`. It is excluded from
scheduled candidates, and the scheduler cannot assign it a confirmed opening
window. No hours are inferred from an outdoor search phrase or `openNow`.
Published weekly hours are evidence, not a guarantee against holiday changes.

## Debugging

The production Google provider adds `debug` alongside `venues` in `/api/venues`:

- `requestedActivities`, `requestedActivity`: extracted phrases and the first unmet
  activity (or first phrase when all are satisfied).
- `curatedCandidates`: catalogue records inspected; `eligibleCuratedCandidates`
  and `curatedActivityMatches`: eligible records and explicit matches.
- `curatedRejectedReasons`: counts from existing planning eligibility checks.
- `googleResults`: raw results across queries; `googleCandidates`: unique accepted
  venues; `rejectedResults`, `rejectedReasons`, `rejections`: Google rejections,
  including duplicates, missing identity, location, budget, hours and mismatch.
- `targetedQueries`: always 0 or 1; `failedQueries`: failures without retries;
  `unverifiedSuggestions`: accepted outdoor results with unknown hours.

Inspect the JSON response in browser Network tools or a local HTTP client. Counts
contain no API keys. Existing injected providers that implement only `discover`
retain the original `{ venues }` contract.

## Offline verification

```sh
node --experimental-strip-types --test tests/targeted-discovery.test.js
npm test
npm run typecheck
npm run build
```

All new tests use synthetic fixture providers and loopback HTTP. No paid calls,
key changes, dependencies, frontend screens/styles or database changes.

Google reference checked before implementation:
[Text Search](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText),
[Place fields](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places),
[Place types](https://developers.google.com/maps/documentation/places/web-service/place-types).

## Validation recorded for this change

- New mocked discovery cases: 19 passed.
- `npm test`: 476 passed, 0 failures across web/backend, mobile, events,
  research and social-link suites.
- `npm run typecheck`: passed for domain, mobile, backend and web.
- `npm run build`: passed (existing bundle-size warning remains).
- Existing browser discovery/planning regressions: 13 passed; 3 stop-detail dialog
  assertions in `tests/e2e/engine.spec.js` failed. Those identical assertions also
  fail on an untouched snapshot of main `f3b3274`, whose itinerary now uses inline
  stop details. No tests or frontend components were changed to hide them.
- No live or paid provider requests and no real-device test.

Task-specific changed files:
`server/google.js`, `server/index.js`, `src/engine/requestedActivity.js`,
`src/engine/preferences.js`, `src/engine/filtering.js`, `src/engine/scoring.js`,
`tests/targeted-discovery.test.js`, and this document.
