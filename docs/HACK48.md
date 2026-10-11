# Shared Hack48 event prototype

The existing web **What’s On** feed includes Hack48 at
**33 Moses Way, Winston Hills NSW 2153**, **10–12 October 2026**, Sydney timezone.
The address and dates were supplied by the user; session times, price, coordinates
and ticket availability were not supplied and are not invented. The event can be
opened directly at `/events?event=hack48-2026` on the web app, including phone browsers.

## Run and upload

From main:

```sh
npm run dev
```

Vite listens on the network; the API stays on loopback and is reached through
Vite’s existing `/api` proxy. Open the **Network** URL shown by Vite on another
device connected to the same trusted Wi-Fi, then `/events?event=hack48-2026`.
This is not an internet deployment. Keep the development server running.

On the first event request the server creates a private organiser edit code in
`.local/shared-events/hack48.edit-code`. Open that local file in your editor and
copy the code into **add images or a Reel → organiser edit code**. Never commit,
publish or send it to attendees. It is not returned by the public event API,
stored in browser storage or added to URLs. The field clears on page reload.
Alternatively set `HACK48_EDIT_CODE` locally in the root `.env` and restart the
server. Keep the value private; do not use a `VITE_` environment variable.

Upload JPEG, PNG or WebP images up to **1.5 MB each**, or paste a full Instagram
Reel URL. Reels reuse the social URL parser and the existing embedded preview,
with an original-link fallback. They are links, not downloaded video files.
Invalid links, duplicates, incorrect edit codes and storage errors are displayed.
The prototype allows up to 20 attachments for this one event.

Uploads persist on the **shared server**, not in an organiser’s localStorage.
Other viewers refresh to see updates. No accounts, paid services, database
migrations or new dependencies are required. This organiser code is a prototype
edit permission, not user authentication or secure multi-user moderation.

## Storage and later work

`.local/shared-events/` is gitignored and contains the event JSON, image files and
private edit code. JSON writes are atomic and serialized within one API process.
Back up this folder to retain uploads when moving/reinstalling the server. Do not
run multiple API writers on the same folder. `SHARED_EVENTS_DIRECTORY` can point
to a different persistent folder; leave it empty to use the default.

Viewers can read event details/media without the edit code. Only code holders can
upload. QR generation and attendee comments are **not implemented in this task**.
A later QR can point to the stable event URL; access outside Wi-Fi will require
hosting. A public comment workflow will need persistent shared storage and an
appropriate moderation/authentication decision.

No live Google, Ticketmaster, OpenAI or Instagram calls are made during tests.
The Instagram preview can depend on the viewer’s network, login and the post’s
embedding availability. Original links remain available.

Validation commands:

```sh
npm test
npm run typecheck
npm run build
npx playwright test tests/e2e/hack48.spec.js tests/e2e/events.spec.js
```

Validation on 11 October 2026:

- `npm test`: **406 tests passed**, including 8 new shared-event/store/API tests.
- `npm run typecheck`: passed for domain, mobile, backend and web.
- `npm run build`: passed; the existing Vite chunk-size warning remains.
- Focused Playwright: **8 tests passed** (2 new Hack48 flows and 6 existing event
  regressions). The new flow proves that an independent browser receives the
  same persisted images/Reels, validates private editing, keeps the organiser
  code out of localStorage, and makes no unrelated event/search requests on the
  direct Hack48 page. Instagram previews and providers were mocked.
- Real phones, actual cross-device Wi-Fi connectivity, real image uploads and
  live Instagram playback were not tested. This is the web feed; no new native
  Expo screen was introduced. Phone browsers use the same shared event URL.

Changed files: `.env.example`, `.gitignore`, `server/index.js`, `server/hack48.js`,
`src/data/hack48.js`, `src/services/hack48.js`, `src/components/Hack48Media.jsx`,
`src/components/EventPoster.jsx`, `src/pages/Discover.jsx`, `src/styles.css`,
`tests/hack48.test.js`, `tests/e2e/hack48.spec.js`, `tests/e2e/fixtures.js`, and
`docs/HACK48.md`. Existing unrelated unfinished work is preserved.
