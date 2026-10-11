# Native onboarding from main

The Expo onboarding is ported from main commit `74ff2ad57d42008322461a989813b0b715c223da`. It uses native controls rather than embedding the web page: six sections, one question at a time, optional details and vibe questions, calendar/time choices, swipeable ideas, food, dining vibe and notes. The Maple Shore font and original code-drawn illustrations are copied from the existing main frontend. Other native screens keep their existing theme.

The home date/hangout buttons open `/onboarding?step=profile`. Each question is an Expo Router history entry, so Back returns to the questions actually visited, including optional questions. Answers use the existing `melloway.mobile.v1` device store. Older drafts and saved plans are retained; the new answer object is merged with defaults on rehydration.

The current generator still accepts the original shared `Preferences` contract. Optional missing day/time are resolved to Sydney today and 11 am at submission; stale implicit dates are refreshed, while explicitly selected past dates are rejected. Budget, selected area, transport, duration and preference chips feed that planner. New idea, dining-vibe and notes answers are saved separately for the later curation migration and are not yet interpreted by the current planner. Profile age and gender do not influence recommendations.

Location selection currently searches the existing Sydney areas and shows their centres on the native map (Apple Maps in iOS Expo Go). Precise address autocomplete and the newer main curation/provider contract are a later integration. The web preview shows selectable areas instead of the native map. Neither view claims these area centres are venues or directions.

Run the root validation commands and `npx playwright test --config playwright.mobile.config.js tests/mobile-e2e/onboarding.spec.js`. For a preview already running on another port, set `MOBILE_E2E_URL`, e.g. `MOBILE_E2E_URL=http://localhost:8088`. The browser journey checks do not establish iOS/Android device success; native export checks bundles only.
