# Melloway development guide

Melloway is a Sydney-first date and hangout planner. Preserve the working React/Vite app while React Native equivalents are developed. Use a reviewed feature branch without a `codex/` prefix; never overwrite `main` or remove legacy screens without working replacements and review.

## Architecture and decisions

- `apps/mobile/src/app/`: Expo Router routes and navigation only. `screens/` contains React Native screens; `components/` contains reusable native controls and map implementations; `theme.ts` holds the existing cream/pink/yellow/green palette and Outfit/Yellowtail typography.
- `apps/mobile/src/store/`: Zustand with AsyncStorage. `hooks/` uses TanStack Query for generation mutations; `services/` holds configuration, HTTP provider adapters, and platform identity. No browser-relative API URLs or direct browser storage in native code.
- `packages/domain/src/`: framework-independent TypeScript types, demo data, preferences, bounded DFS planning, scheduling, replacement, and provider-injected generation. No React, Expo, HTTP, storage, or secret dependencies here.
- `src/`: preserved React/Vite application, including saved plans, fictional community/events and optional Supabase sync. The newer web planner/data and discovery modules from remote `main` remain intact; reconcile their validation, overnight scheduling and saved-plan replacement behaviour with the shared package in a later migration.
- `server/`: preserved Node Google Places/Routes/photo adapter and original Supabase schema. Incremental backend TypeScript migration comes later; do not rewrite it during mobile work.
- `supabase/migrations/`: versioned database schema and PostGIS foundation. Never apply migrations to a live project without authorization. Do not run the initial schema migration over a project where `server/schema.sql` has already been applied; baseline it.
- `tests/`: original constraints, migration regression tests, pure mobile API/config tests. `tests/fixtures/legacy-planner.js` is the frozen pre-migration algorithm; do not alter it to make parity checks pass.

Use npm workspaces and one root lockfile. Expo SDK 54 targets React Native 0.81 and React 19.1.0; keep one React version across apps. Install native dependencies from `apps/mobile/` with `npx expo install`, then run Expo Doctor. Metro uses Expo's default monorepo configuration. The domain package emits ESM/declarations into ignored `dist/` for Node/Vite, while native Metro uses TypeScript source. `npm install` builds the package; rebuild after domain edits before running Node services or the web app.

## Responsibilities and conventions

The backend developer owns shared domain types/planning, provider contracts and validation, Node API integration, Supabase/PostGIS schema, auth/storage services, routing and meaningful tests. The frontend teammate owns native screens, reusable UI, theme, animation, accessibility and map presentation. Agree on shared types before either side changes contracts. Keep algorithms and fetch/storage code outside screens. Use strict TypeScript for new logic; prefer explicit interfaces and small functions over extra architecture. StyleSheet is sufficient now; introduce NativeWind only where it provides clear value.

Keep the original optimiser behaviour unless algorithm changes are explicitly requested: top 14 candidates, 120,000 DFS node bound, 3–5 stops, scoring, budget/transport allowances, weekday hours and route-edge pruning. Profile demographics must not affect recommendations. Demo hours, costs, ratings, events, imagery and distances must remain clearly labelled. Never present straight-line connections as walking/transit directions or claim global optimality. No social scraping, payments or AI integration in this milestone.

Never commit API/service-role keys, environment files, native signing credentials or generated native projects. `EXPO_PUBLIC_*` values are visible to clients. Places/Routes keys belong on the server; Maps SDK keys are distinct, embedded in native binaries and must be restricted by app identity. Demo mode must work without credentials or a backend. Device-local data is not a cross-device account; do not store auth tokens in the current profile store.

## Validation expectations

Run `npm test`, `npm run typecheck`, `npm run lint --workspace @melloway/mobile`, and `npm run build`. For navigation/native-dependency changes also run `npx expo install --check`, `npx expo-doctor`, and `npx expo export --platform all` from `apps/mobile/`, plus a manual flow check. Tests should cover constraints, original algorithm parity and real provider boundaries rather than mirror component internals. Check landing → onboarding → details/vibes → generation → itinerary → venue, saving/reloading, regeneration, swap, and a no-feasible-plan case. Report native bundles separately from actual iOS/Android builds and device testing. If Xcode/Android tooling or credentials are unavailable, say what remains unverified.
