# Discovery bot v1 progress

Work branch: `discovery-bot-v1`, based on `expo-mobile-migration` at `2607f60`.
Existing uncommitted venue-video work is preserved and excluded from this chunk's commit.

| Checkpoint | Status | Scope |
| --- | --- | --- |
| 1. Mock discovery pipeline | COMPLETE | Pure TypeScript, injected mock provider, source evidence and pending candidates |
| 2. OpenAI search adapter | NOT STARTED | Requires completed checkpoint 1 and a separate instruction |
| 3. Local review queue | NOT STARTED | Requires completed checkpoint 2 and a separate instruction |
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
Checkpoints 2–4 remain unimplemented; stopped after checkpoint 1.
