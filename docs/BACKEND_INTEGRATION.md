# Backend consolidation onto main

Completed 2026-10-11 as a selective integration, not a merge of the Expo branches. The user authorized committing and normally pushing completed backend work to main. The teammate owns all frontend work.

## Preserved baseline and recovery

The fetched teammate baseline is `af3f8c8cd4d5054255f22e4be3ea10d822b83630` (`changed feed`, Jenamari Bathan). PR #1, the teammate's frontend implementation, was already merged. Open PRs #2 and #3 contain discovery/usability work targeting `expo-mobile-migration`; neither was merged or changed. No clearly newer teammate frontend PR was found.

| Inspected reference | SHA before integration |
| --- | --- |
| origin/main | af3f8c8cd4d5054255f22e4be3ea10d822b83630 |
| local main | 71fcd3b8d684dc4c96a68165d4377de4ba00e741 |
| expo-mobile-migration | 2607f6037599755482f07bfa7e5a3b8136b90426 |
| discovery-bot-v1 | 75d713f6291f8be4de4d8d56f9c066cb45dcef76 |
| app-usability-v1 | 7fb91ce2bb0f8dd9db0a3c86cc543b41e90b6137 |
| maps-js-key | 71f908104c33e2e80055f1c1daa200a9be50c98a |

Recoverable **local** tags were created before integration:

- `backup/main-before-backend-20261011` retains the former local main, including its unpublished Expo merge history.
- `backup/origin-main-before-backend-20261011` retains the fetched teammate main baseline.

Integration used the isolated checkout `/Users/shana/.codex/worktrees/backend-main/melloway`, initially detached at origin/main. Existing discovery, usability and Maps worktrees were preserved; no files were reset, stashed or discarded, and no active task was interrupted. The original checkout remained busy with an unfinished social-link/venue-video fix. Its README, package/scripts configuration, social parser/tests, server changes, mobile screens/services/store and mobile tests were excluded rather than automatically committed. No credentials or `.env` were copied into the integration checkout. Old branches and worktrees remain available.

## What was retained

- Pure TypeScript full TikTok/Instagram Reel URL validation and normalization, with its existing tests. Short redirect resolution remains unfinished on its original branch.
- All four completed discovery checkpoints: source-evidenced pending candidates, the bounded opt-in server Responses adapter, a private local JSON review queue, explicit decisions and approved-only export. Mock mode remains the default; generated research stays ignored.
- Ticketmaster fetching/CLI, event data types and coordinate grouping, plus the existing 60-second snapshot cache adapted to a JSON-only `GET /api/events`. It returns events, points, missing-coordinate count and browser-key configuration availability without exposing any key.
- Shared non-UI types, demo data and existing pure planner/preferences/generation utilities. The shared legacy planner remains standalone; it does not replace main's newer frontend planning implementation.
- Existing itinerary and PostGIS SQL migration files, **without applying them**. Baseline the itinerary migration if `server/schema.sql` was already applied; its policy is not intended to be blindly rerun.
- Backend tests, labelled synthetic fixtures, commands, environment placeholders and the root backend-only hackathon instructions in `AGENTS.md`.

Main's newer `server/google.js`, `server/openai.js`, `server/schema.sql`, and all original test files were retained unchanged. Existing status, location search/resolve, venues, matrix, photos, intent and recommendations keep their shapes, provider logic, credentials, validation, CORS and rate limits. The server factory permits injected offline providers for contract tests; importing it no longer binds a test port. The normal entry point still binds loopback and respects PORT. The development watcher remains enabled.

## Frontend deliberately excluded

No `apps/mobile` files, Expo migration/framework dependencies, Codex screens/components/navigation/styles/assets/client stores/services, video previews/attachment UI, event-map screen, itinerary sharing UI, presentation formatters or mobile browser/device tests were imported. The generated server-hosted HTML Google map and its UI-specific tests were also excluded; `/api/events-map` is not added to main. These implementations remain recoverable on their existing branches and were not rewritten into the teammate's frontend.

The frontend baseline comparison has **no diff** for `src/`, `public/`, `prototype/`, `index.html`, Vite/Capacitor/Playwright configuration or `tests/e2e/`. Backend consolidation does not add new frontend routes or connect discovery/export/Ticketmaster to screens. Ownership that was unclear was resolved by retaining main's version.

Every pre-existing locked package has the same version, resolved URL and integrity. Existing frontend dependency declarations are unchanged, including React/React DOM 19.3.0 in the lockfile. One root lockfile is retained. Added direct dependencies are the local framework-independent domain workspace, TypeScript and the already-locked Node declarations; additional optional lock entries reflect npm's workspace layout, with no existing package upgrade. The production build produces the same hashed frontend assets as the baseline.

## Verification

The original main's 45 unit tests and production build passed before integration. Final integration checks:

- `npm ci`: passed; zero audit vulnerabilities reported.
- `npm test`: **181 passed**, zero failures (121 root JS, 25 event/backend, 35 discovery).
- `npm run typecheck`: passed for the domain and strict server/CLI/TypeScript tests. The preserved frontend remains JavaScript.
- `npm run build`: passed. The baseline's existing large-chunk warning remains; no unrelated baseline failures were found.
- Existing Playwright suite: **47 passed**. Temporary configuration changed only test ports to 3012/5182, used empty credentials and the installed Chrome, and was removed afterwards. No existing server/app was stopped and no frontend tests were rewritten.
- Existing API regression tests cover response shapes, validation, credential gates, local search, CORS, recommendation rate limits, injected providers, additive event JSON and exclusion of the generated map page.
- The end-to-end mock discovery test covers one café → pending candidates → explicit fixture approval → approved-only export in disposable storage. No actual research entries were approved.
- Frontend/provider baseline comparison, existing lock-version checks, `git diff --check` and staged credential/research review passed.

No real OpenAI, Ticketmaster or Google request was made for integration. Live discovery was **NOT tested overnight** or during this task. No database migration, deployment, billing/API/quota change, real booking or real-phone verification was performed. Private local review remains unsuitable for secure multi-user moderation. Existing app credentials/account settings and all old branches/worktrees are untouched.

## Future work

Follow root `AGENTS.md`: use updated main, make small tested backend-only commits and push normally. No new feature branches or frontend edits unless explicitly requested. Fetch again immediately before pushing, preserve any newer teammate commits and revalidate affected work. Never force-push or bypass protections.

Publishing status and the final integration SHA are reported in the task response after verification against the remote; this document does not claim a push before it succeeds.

## Changed files

The committed list below includes only the selective backend integration and its documentation; excluded UI and unfinished work are not included.

- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `docs/BACKEND_INTEGRATION.md`
- `docs/DISCOVERY_HANDOFF.md`
- `docs/DISCOVERY_PROGRESS.md`
- `docs/DISCOVERY_REVIEW.md`
- `docs/TICKETMASTER.md`
- `package-lock.json`
- `package.json`
- `packages/domain/package.json`
- `packages/domain/src/events.ts`
- `packages/domain/src/generate.ts`
- `packages/domain/src/index.ts`
- `packages/domain/src/planner.ts`
- `packages/domain/src/preferences.ts`
- `packages/domain/src/socialDiscovery.ts`
- `packages/domain/src/socialMediaUrl.ts`
- `packages/domain/src/types.ts`
- `packages/domain/src/venues.ts`
- `packages/domain/tsconfig.json`
- `scripts/dev.js`
- `scripts/discovery-review.ts`
- `scripts/fetch-sydney-events.ts`
- `server/discoveryExport.ts`
- `server/discoveryReviewQueue.ts`
- `server/events.ts`
- `server/index.js`
- `server/socialDiscovery.ts`
- `server/ticketmaster.ts`
- `server/tsconfig.discovery.json`
- `supabase/migrations/20261010000100_create_itineraries.sql`
- `supabase/migrations/20261010000200_enable_postgis.sql`
- `tests/api-contracts.test.js`
- `tests/discovery-export.test.ts`
- `tests/discovery-review-queue.test.ts`
- `tests/events.test.ts`
- `tests/fixtures/legacy-planner.js`
- `tests/fixtures/mock-openai-social-discovery.ts`
- `tests/fixtures/mock-review-search.json`
- `tests/fixtures/mock-social-discovery.js`
- `tests/migration.test.js`
- `tests/openai-social-discovery.test.ts`
- `tests/social-discovery.test.js`
- `tests/social-media-url.test.js`
- `tests/ticketmaster.test.ts`
