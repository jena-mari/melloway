# Capture results from your working TikTok browser

This private workflow reads public links and captions already loaded in your
browser when unofficial TikTokApi search returns a blank response. It does not
send another search API request, copy cookies, download videos, scroll
automatically or publish into Melloway. It cannot guarantee future searches.

1. Search TikTok normally in Chrome, for example **MATCHA-YA Haymarket**, and wait
   for results. You can also ask Codex to search/read that page through the
   existing connected Chrome browser; you do not have to type every search.
2. Capture the first twenty displayed post links with
   [`scripts/tiktok-browser-capture.js`](../scripts/tiktok-browser-capture.js).
   Run its contents in Chrome's developer console, then right-click the returned
   object and choose **Copy object**. Alternatively, Codex can read the same
   visible DOM through its connected browser and save this format locally.
3. Save the JSON under `.local/discovery/`, then import it:

```sh
npm run discovery:browser -- --queue .local/discovery/browser-review.json sydney-matchaya "MATCHA-YA" "Haymarket" .local/discovery/matchaya-browser.json
npm run discovery:review -- --queue .local/discovery/browser-review.json list
```

The import is offline: no Python/TikTokApi setup, browser startup, credentials
or paid service is required. Captures are bounded to 256 KB, twenty video sources
and 8,192 characters per caption. Only canonical full TikTok video URLs are
accepted. Photo posts are excluded rather than labelled as videos. Search
URL/time are reported separately as capture provenance. Browser captures are
labelled separately from fictional mocks and automatic TikTokApi lookups.

The existing matcher requires the caption to mention the exact café name and
suburb. The query cannot supply missing evidence. Empty/unmatched captures
stay empty; a valid URL or high search rank alone does not prove the venue.
Missing captions stay blank. The capture script reads only the page URL, post
links and image caption text; it makes no requests or storage/cookie reads.

Matches enter the existing local review queue as **pending**, with source links
and caption evidence. Reruns do not duplicate posts or change earlier decisions.
Use the existing explicit review/export commands when appropriate. No matches
are automatically approved. Page text is untrusted; video content and venue
location have not been verified.

This is local research, not an unattended app backend. The website's
`/api/social/search` is a separate provider path. This queue does not populate
the website or Expo app. Frontend, API contracts, route optimisation, database,
dependencies and credentials remain unchanged.

Other researched options:

- TikTokApi supports a custom context factory with a persistent profile
  ([maintainer example](https://github.com/davidteather/TikTok-Api/blob/main/tests/test_custom_launchers.py)).
  This is a possible experiment, not a verified fix. Playwright does not support
  automating the normal Chrome user-data directory
  ([official documentation](https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context)).
  Do not copy the user's full profile/cookies into the collector.
- Official TikTok Research access requires application; it is not a drop-in
  search endpoint for this app
  ([TikTok documentation](https://developers.tiktok.com/doc/research-api-get-started)).

Automated tests use synthetic DOM/JSON and temporary queues only. They check
bounds, provenance, caption matching, pending status, deduplication and failure
handling without browser, TikTok or paid-provider requests.

Verified on 11 October 2026: a connected Chrome search captured twelve real
video links from the already-loaded first twenty post cards. Offline import
found one caption matching MATCHA-YA and Haymarket and saved it pending. A repeat
import added no duplicates and preserved its pending status. Real captures and
research files remain ignored locally, outside the tests and commits.

`npm test` passed 393 tests, including seven new browser-import tests;
`npm run typecheck` and `npm run build` passed. The existing Vite chunk warning
remains. Two bounded WebKit checks did not establish an automatic fix: one
search-page session started but yielded no readable result body or video links;
the existing keyword collector then failed session creation. These were opt-in
diagnostics, separate from mocked tests. No paid service or CAPTCHA interaction
was used. Reliable unattended TikTokApi search remains unverified.
