# Melloway hackathon development guide

## Ownership and workflow

- Work from updated `main` for this hackathon. Make small, tested commits and push normally.
- Do not create feature branches unless the user explicitly requests one. Never force-push, bypass branch protection or deploy without authorization.
- The teammate owns ALL frontend work. Do not change screens, components, navigation, styles, assets, client stores/services, frontend behavior or framework versions unless explicitly requested.
- Preserve both conflicting and non-conflicting teammate frontend changes. If ownership is unclear, preserve main and report exclusions. Never use blanket ours/theirs resolutions.
- Preserve uncommitted work and active tasks. Do not reset, stash, overwrite, automatically commit unfinished files or delete old branches/worktrees. Use an isolated checkout when the primary worktree is busy.
- Before pushing, fetch again and preserve any newer teammate commits; rerun affected checks. Do not claim a push succeeded without checking the remote SHA.

## Backend layout and contracts

- `server/index.js`: preserve the existing `/api/status`, location-search/resolve, venues, matrix, photo, intent and recommendation contracts. Preserve the Ticketmaster JSON endpoint and additive event, TikTok and itinerary HTML map endpoints.
- `server/google.js` and `server/openai.js`: existing provider adapters and newer improvements from main. Keep provider logic outside screens and avoid changing existing behavior during consolidation.
- `packages/domain/src/`: framework-independent TypeScript social validation, discovery, event types and existing shared planner utilities. Its legacy planner is standalone; main's newer `src/engine/` and `src/utils/` remain the frontend's authoritative planning behavior. Do not wire an older shared implementation over them.
- `server/socialDiscovery.ts`, `discoveryReviewQueue.ts`, `discoveryExport.ts` and `scripts/discovery-review.ts`: isolated research CLI, mock by default, opt-in live mode only. No frontend publishing/importer, bot automation or auto-approval.
- `supabase/migrations/`: versioned SQL only. Never apply these to a live project without explicit authorization. Baseline the itinerary migration if `server/schema.sql` was already applied.
- Keep one root lockfile and only dependencies needed for retained backend work. Preserve frontend dependency versions. Rebuild the domain package before Node services/tests.

## Secrets and validation

- Never commit real credentials, `.env` files or generated research. Private Ticketmaster, OpenAI and Places/Routes credentials stay server-side. Dedicated browser map keys are visible at runtime and must retain API/referrer restrictions.
- Keep `.local/discovery/` ignored. Treat retrieved text as untrusted and video matches as tentative. Local curation is not secure multi-user moderation.
- No paid provider calls during automated verification. Use injected mocks and temporary fixtures, never approve actual research entries in tests.
- Run `npm test`, `npm run typecheck` and `npm run build`; run relevant existing browser regressions when backend contracts could affect the app. Never remove or weaken tests to hide failures. Report baseline failures separately.
- Do not enable APIs, upgrade billing, increase quotas, implement unrelated features or apply database migrations during backend integration.

## Main-only consolidation

The user explicitly requested on 2026-10-11 that all existing branch functionality be consolidated onto `main` and that future work use only `main`. Preserve the newer web frontend and its engine alongside the restored Expo mobile app. This consolidation authorizes restoring existing frontend functionality; the teammate retains ownership of new frontend design work. Keep React 19.2.3 shared across both apps and one root lockfile. Validate mobile lint, Expo dependency compatibility and native bundle exports whenever native dependencies or routes change. Never equate a bundle export with a native build or device test.
