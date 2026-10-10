# Mobile contribution guide

Follow the repository-root AGENTS.md. This app uses Expo SDK 57, React Native 0.86 and React 19.2.3. Read the matching SDK docs at https://docs.expo.dev/versions/v57.0.0/ before adding or changing Expo/native APIs; consult https://docs.expo.dev/llms.txt for navigation/configuration guidance. Use the installed library types and Expo Doctor to confirm compatibility rather than assuming older APIs still apply.

Routes live in `src/app/`; keep them thin. Screens, reusable native controls, styling, hooks, stores and services belong in their separate `src/` directories. Frontend design work should use `theme.ts` and the shared domain interfaces. Keep recommendations, scheduling and scoring in `@melloway/domain`, not in UI. Use Expo Router for navigation, Zustand for device state, TanStack Query for asynchronous service work and AsyncStorage for current device-local persistence.

Install from the repository root. Add native dependencies from this directory with `npx expo install <package>`. Do not add another lockfile, another React version or manual Metro monorepo resolver overrides. Run `npm run typecheck` and `npm run lint` here; run `npm test` and `npm run build` at the root. For changes affecting routing/native modules also run `npx expo-doctor` and `npx expo export --platform all`, then test the user flow.

Use only native components and styles; do not copy DOM/CSS. Keep all touch targets at least 44 points, provide labels and checked/disabled state, respect reduced motion, and test keyboard/large-text/safe-area behavior on devices. Demo prices/hours/pins/photos/travel estimates must be labelled. Do not draw estimate edges as road geometry. iOS Expo Go uses Apple Maps; Google Maps on standalone iOS/Android requires the separate app-restricted SDK keys. `PlanMap` exposes the same typed interface on native and web.

Expo Go supports the native modules currently installed. Custom native configuration or a future module absent from Expo Go requires a development build. Keep generated `ios/` and `android/` directories out of Git and configure native behavior through `app.config.ts` and config plugins. Never claim native-build or device success based only on TypeScript checks or Metro bundle export.

Demo mode needs no server. Native live mode uses an absolute `EXPO_PUBLIC_API_URL` origin; public Expo variables cannot hold private credentials. Places/Routes keys stay on the Node server. Mobile auth/cloud sync and community are later milestones; profile state is not secure token storage.
