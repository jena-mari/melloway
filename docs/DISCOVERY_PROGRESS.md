# Discovery bot v1 progress

Work branch: `discovery-bot-v1`, based on `expo-mobile-migration` at `2607f60`.
Existing uncommitted venue-video work is preserved and excluded from this chunk's commit.

| Checkpoint | Status | Scope |
| --- | --- | --- |
| 1. Mock discovery pipeline | COMPLETE | Pure TypeScript, injected mock provider, source evidence and pending candidates |
| 2. OpenAI search adapter | COMPLETE | Server-only opt-in Responses adapter; mocked tests only |
| 3. Local review queue | COMPLETE | Ignored JSON storage, mock CLI, explicit local review decisions |
| 4. Export, verification and handoff | NOT STARTED | Requires completed checkpoint 3 and a separate instruction |

## Rules for all chunks

- Implement only the current chunk; test, update this file and commit only task-specific files.
- Preserve existing work and never remove or weaken tests to hide failures.
- After two unsuccessful repair attempts, mark the current checkpoint BLOCKED and stop. Later queued chunks must stop if their prerequisite is blocked.
- No deployment, merging, force-pushing or billing changes. Preserve normal permission requirements.
- No real discovery API calls overnight: use mocks.

## Checkpoint 1 contract

`discoverSocialVideos` is exported by `@melloway/domain`. Supply one `DiscoveryCafe`
with `venueId`, exact `name` and Sydney `suburb`, an injected provider with
`mode: 'mock'` and `search(cafe)`, and an optional clock for deterministic tests.
The provider returns direct video search sources with `url`, optional `title`
and optional `snippet`. No provider implementation, credentials, HTTP or storage
are included. This module is separate from the existing itinerary discovery services.

The source URL itself must pass `parseSocialMediaUrl`; arbitrary article URLs
and shortened links are excluded. Combined title/snippet evidence must mention
both the exact café name and suburb (case/whitespace/Unicode normalization,
phrase boundaries). The pipeline preserves the supplied source URL and evidence
in its explanation. Evidence is untrusted search text, not proof that a video
features the café. It does not verify Sydney geography or video existence/content.

Candidates contain `venueId`, `platform`, `postId`, `normalizedUrl`, `sourceUrl`,
`matchExplanation`, `uncertainty`, `discoveredAt` (ISO timestamp) and
`status: 'pending'`. Output follows source order, deduplicates venue/platform/post
ID and stops at five. Missing evidence and unsupported URLs are skipped; zero
results stay empty. Provider errors propagate without demo fallback.

Tests use clearly marked fictional fixtures in `tests/fixtures/mock-social-discovery.js`.
Run `npm run build:domain && node --test tests/social-discovery.test.js`
for this chunk, or `npm test` for the full unit suite.

## Checkpoint 1 verification

Completed 2026-10-11. All checks passed on their first run; no repair attempts were needed.

- Focused discovery tests: 9 passed (valid candidates, traceability, duplicate
  identities, unsupported links, missing evidence, exact phrase matching,
  empty results, five-result cap, input validation and provider failures).
- `npm test`: 128 passed (88 root, 14 mobile service, 26 event tests).
- `npm run typecheck`: passed for the domain package and mobile app.
- `npm run lint --workspace @melloway/mobile`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

No real search/discovery API calls, scraping, credentials, network adapter,
storage or device testing. No frontend, maps, events, routes or database changes
in this chunk. Existing uncommitted venue-video files remain outside its commit.
At the checkpoint 1 handoff, checkpoints 2–4 were unimplemented.

## Checkpoint 2 contract and configuration

`server/socialDiscovery.ts` exports `discoverCafeVideos(cafe, options)`.
It is server-only and is not wired into screens, routes, maps, events, databases
or the existing planner. The pure checkpoint 1 pipeline and its tests remain intact.

- Default mode is `mock`, regardless of configured credentials. An optional
  `mockProvider` supplies fixture sources; with no provider it returns `[]`.
- Only an explicit call with `{ mode: 'live' }` enables a Responses request.
  Set `OPENAI_API_KEY` and `OPENAI_DISCOVERY_MODEL` in the server environment
  (or root ignored `.env` when a Node caller loads it). Never use `EXPO_PUBLIC_*`
  for either value. The model must support Responses `web_search` and structured
  outputs; no model or account compatibility was verified with a real request.
- One POST to `https://api.openai.com/v1/responses`; raw fetch has no automatic
  retries, pagination, polling or fallback. Errors do not expose the key,
  response body or underlying provider exception.
- Only `web_search`, with `external_web_access: false` and allowed domains
  `tiktok.com` / `instagram.com`. Live mode refers to calling Responses;
  the search itself still uses cached/indexed content.
- Hard limits: `max_tool_calls: 2`, `max_output_tokens: 2000`, 20-second timeout
  covering both request and response body. `timeoutMs` may lower this deadline,
  never raise it. No background mode, streaming, stored response or continuation.
- Input requests the café's exact name AND Sydney suburb. Retrieved text and
  café parameters are untrusted data, not instructions. Search actions only;
  unexpected actions, other tools, incomplete/refused responses and excessive
  tool calls fail closed without retries.
- Candidate URLs must exactly match URL entries from completed
  `web_search_call.action.sources`. Generated URLs, citation annotations and
  normalized lookalikes cannot establish source membership. The existing parser
  independently rejects unsupported hosts, short links and invalid paths.
- The current source list schema supplies URLs, not independently checkable
  excerpts. The model-reported evidence must mention both café name and suburb
  using checkpoint 1 checks, but remains explicitly labelled unverified. Source
  inclusion proves discovery only: no claim of watching videos, popularity,
  availability or a verified café match. Every result remains `pending`.
- Reuse checkpoint 1's venue/platform/post-ID deduplication and five-result cap;
  empty sources never produce fabricated candidates.

Official documentation checked 2026-10-11 before implementation:
[Web search](https://developers.openai.com/api/docs/guides/tools-web-search)
(current tool, domain filters, cache-only control and preview limitations) and
[Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
(sources shape, output format and request limits). The reference's Markdown
version was fetched directly after the browser reader failed on the large page.

Run `npm run test:discovery` for the mocked adapter suite and
`npm run typecheck:discovery` for strict checks of the adapter, tests and fixtures.
Both are included in the root `npm test` / `npm run typecheck` commands.
The suite injects all fetch responses and uses explicitly fictional fixtures;
it never reads `.env`, needs real credentials or makes actual API calls.

## Checkpoint 2 verification

Completed 2026-10-11. All checks passed on their first run; no repair attempts were needed.

- Focused mocked adapter tests: 13 passed, including success, empty sources,
  fabricated URLs/citations, malformed responses, timeout and missing credentials.
- `npm test`: 141 passed (88 root, 14 mobile service, 26 events, 13 adapter).
- `npm run typecheck`: passed, including strict server adapter/tests checks.
- `npm run lint --workspace @melloway/mobile`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

No real OpenAI API request was made. Actual model/account compatibility,
cached source coverage and real café/video matches remain untested.
Existing uncommitted venue-video work is preserved and excluded from this commit.
At the checkpoint 2 handoff, checkpoints 3–4 were unimplemented.

## Checkpoint 3 contract

`server/discoveryReviewQueue.ts` supplies a separate local JSON store with
pending-only discovery imports, listing and explicit manual approve/reject
decisions. `scripts/discovery-review.ts` provides the mock-only CLI.
See [commands and file safety](DISCOVERY_REVIEW.md).

Default storage is `.local/discovery/review-queue.json`; its entire directory
is ignored by Git. Records preserve all discovery fields plus a generated ID
and `decidedAt` timestamp/null. Discovery cannot import approvals. Duplicate
imports retain the entire previous record, including approval/rejection times.
Explicit opposite human decisions may change a decision; identical ones are idempotent.

Storage validation rejects malformed schemas, URLs/provenance, timestamps,
decision states and duplicate IDs/identities. Exclusive locks protect cooperating
writers; flushed same-directory temporary files and atomic rename avoid
truncating the current file. Invalid storage is never silently reset.

This is private local curation, not secure multi-user moderation or publishing.
No frontend, database, endpoint, dashboard or live CLI integration was added.
No credentials are loaded by the CLI. Mock fixtures are explicitly labelled.

## Checkpoint 3 verification

Completed 2026-10-11. All executed checks passed; no unsuccessful repair attempts.

- Queue tests: 15 passed, covering persistence/reopen, duplicate imports,
  explicit decision times and updates, unchanged earlier decisions on rerun,
  malformed storage, pending-only imports, locks/concurrent writers, symlinks,
  CLI commands and Git exclusion.
- `npm test`: 156 passed (88 root, 14 mobile service, 26 events, 28 discovery).
- `npm run typecheck`: passed, including strict queue/CLI/tests checks.
- `npm run lint --workspace @melloway/mobile`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

Approvals/rejections operated only on synthetic records in disposable OS temp
directories. The default queue and actual research entries were not accessed.
No real discovery API calls were made. This is private local curation, not secure
multi-user moderation. Existing uncommitted venue-video work remains excluded
from this commit. Checkpoint 4 is unimplemented; stopped after checkpoint 3.
