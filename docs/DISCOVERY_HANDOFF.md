# Discovery bot v1 handoff

Originally completed on `discovery-bot-v1`, targeting `expo-mobile-migration`.
The completed backend was selectively consolidated onto teammate-owned main;
see [the integration record](BACKEND_INTEGRATION.md) for current checks and exclusions.
All four chunks are isolated from frontend screens, maps, events, routes and databases.
Previous uncommitted venue-video work remains uncommitted and is excluded from this branch's discovery commits.

**Live search was NOT tested overnight. No real OpenAI discovery request was
made in any chunk.** Live-command tests used an injected mock transport only.

## What works

- One supplied café ID, exact name and Sydney suburb produce at most five
  evidenced TikTok/Reel candidates through the existing URL parser. No filler.
- The server Responses adapter requires explicit live mode, server credentials
  and a configured compatible model. It uses current cache-only `web_search`,
  TikTok/Instagram domain filters, returned source membership, one request,
  at most two tool calls, 2,000 output tokens and a 20-second deadline; no retries.
- The private JSON queue validates its entire contents, uses locking and atomic
  replacement, imports only pending records, and preserves previous records
  and decisions on duplicate imports. Explicit human decisions record times.
- Approved-only JSON export excludes every pending/rejected record, retains
  provenance/uncertainty, and leaves the queue untouched. Output is a new file;
  existing outputs are never overwritten.

## Exact mock, review and export commands

Run from the repository root after `npm ci`. These commands require no
credentials and make no discovery API calls. Use a distinct mock queue:

```sh
npm run discovery:review -- --queue .local/discovery/mock-review-queue.json mock mock-cafe-newtown "Mock Café (Test)" "Newtown" tests/fixtures/mock-review-search.json
npm run discovery:review -- --queue .local/discovery/mock-review-queue.json list
npm run discovery:review -- --queue .local/discovery/mock-review-queue.json approve CANDIDATE_ID_FROM_LIST
npm run discovery:review -- --queue .local/discovery/mock-review-queue.json reject ANOTHER_CANDIDATE_ID_FROM_LIST
npm run discovery:review -- --queue .local/discovery/mock-review-queue.json export .local/discovery/mock-approved-videos.json
```

Replace the ID placeholders with actual IDs printed by `list`. Approval is an
explicit fixture review step, never part of discovery. The supplied café and
post URLs are fictional fixtures, not real research. A repeat discovery keeps
all decisions and skips duplicate venue/platform/post combinations. To export
again, choose a new filename. Queue, exports, locks and generated/private
research under `.local/discovery/` are ignored by Git.

The automated demonstration can be replayed without touching the default queue:

```sh
npm run build:domain
node --experimental-strip-types --test --test-name-pattern="end-to-end mock demonstration" tests/discovery-export.test.ts
```

It uses one fictional café in a disposable OS temporary directory: two candidates
start pending; an explicit fixture `approve` command approves one; export contains
only that record while the other stays pending. It then rejects the other and
confirms a second export still contains just the approved record. Temporary
files are cleaned up. Actual research entries are never approved by the demo.

## Opt-in live command (not executed during this work)

Put these variables in the root ignored `.env`, or export them in the server shell:

```dotenv
OPENAI_API_KEY=your_server_api_key
OPENAI_DISCOVERY_MODEL=your_compatible_model_id
```

Use an account-accessible model supporting Responses `web_search` and structured
outputs. Do not put credentials in `EXPO_PUBLIC_*`, frontend files, source control
or the review file. Neither authentication nor model compatibility was tested
with a real request. No billing settings were enabled or changed.

When intentionally opting in later, replace all café placeholders and run:

```sh
npm run build:domain
node --experimental-strip-types --env-file=.env scripts/discovery-review.ts --queue .local/discovery/live-review-queue.json live YOUR_VENUE_ID "Exact café name" "Sydney suburb"
```

If the variables are already exported in the shell, the equivalent is:

```sh
npm run discovery:review -- --queue .local/discovery/live-review-queue.json live YOUR_VENUE_ID "Exact café name" "Sydney suburb"
```

Only the explicit `live` command makes an authenticated Responses request; the
search tool still has external web access disabled. Results are imported pending,
including on reruns. Empty/missing source results never produce demo replacements.
Missing credentials/model or malformed existing queue data fail before API use.
Use the same list/review/export commands with `live-review-queue.json` for later
human curation; no real decisions were made during these tasks.

## Export format and remaining limitations

The JSON has `kind: "melloway-approved-social-videos"`, `version: 1`,
`exportedAt`, `notice` and an approved-only `records` array. Each record contains
`id`, `venueId`, `platform`, `postId`, `normalizedUrl`, `sourceUrl`,
`matchExplanation`, `uncertainty`, `discoveredAt`, `status: "approved"` and
`decidedAt`. This preserves evidence for a future importer; it is not the existing
AsyncStorage venue-video schema. A future importer must validate venue identities
and deliberately map the data. No app integration/importer is implemented.

Source inclusion establishes discovery, not the correct café match. Model-reported
evidence is unverified, retrieved text is untrusted, and no video was watched,
popularity measured or availability confirmed. Cached coverage and freshness,
Sydney geography, actual café/video identity, account/model support and real
provider behavior remain unverified. Full URLs only; no redirect resolution,
scraping, other providers or research automation.

Private local curation is **not secure multi-user moderation**: no accounts,
authentication, immutable audit log or public publishing. Do not manually edit
the JSON during commands. Exports reflect a validated snapshot, not future
changes to decisions. Atomic-file behavior was tested locally; cross-platform
filesystem portability and abrupt power-loss durability were not tested.

## Original checkpoint tests and diff review

The following totals describe the original Expo working checkout, not current main.
Current main validation is recorded in [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md).

Final checks passed: `npm run test:discovery` (35 tests), `npm test` (163 tests),
`npm run typecheck`, mobile lint, production build and `git diff --check`.
The working-checkout total includes nine preserved uncommitted venue-video
service tests, which are excluded from this PR. Seven new export/CLI tests
passed, including the end-to-end mock demonstration. The first strict check found a new
test's union-type narrowing issue; one added assertion fixed it. No tests were
removed or weakened, and no unsuccessful repair attempts followed that repair.

Run `npm run test:discovery`, `npm test` and `npm run typecheck`.
On current main, use `npm run build` and `git diff --check`; mobile lint is only available on the original Expo branches.
No real provider/API tests, app/device tests, deployment, merge or billing changes.
No unrelated baseline failures occurred. Existing Node module-type warnings
were preserved. The full discovery diff was reviewed for secrets and unrelated
edits; no configured credentials, `.env` files or generated research are included.

Final-checkpoint files:

- `server/discoveryExport.ts`: approved-only new-file JSON export.
- `scripts/discovery-review.ts`: export command, explicit live command and injectable test transport.
- `tests/discovery-export.test.ts`: approved-only regression, mock demonstration, safe-output and live-command mocks.
- `tests/discovery-review-queue.test.ts`: clarify the existing incomplete-live-arguments test name; its assertion is unchanged.
- `package.json`, `server/tsconfig.discovery.json`: include new tests and strict checking.
- `docs/DISCOVERY_REVIEW.md`, `docs/DISCOVERY_PROGRESS.md`, this handoff: commands/results/checkpoint status.

Earlier discovery commits add the pure domain pipeline/export, isolated server
adapter, queue, labelled fixtures/tests and ignored research directory. See the
progress file for their checks. Existing frontend edits are not part of the PR.

## Current hackathon workflow

The user authorized backend-only consolidation and normal pushes to `main`.
Follow root `AGENTS.md`: start from updated main, preserve the teammate's frontend,
make small tested backend-only commits, and push normally. No new feature branches
unless explicitly requested. Existing discovery/usability branches and draft PRs
remain available; their generated frontend was not merged into main.
No force-push, protection bypass, deployment, automatic research approval or billing changes.
