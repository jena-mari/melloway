# Local TikTokApi discovery

Optional backend-only provider for the existing private discovery/review CLI.
It runs TikTokApi **7.3.3** locally in Python/Chromium, using the maintainer's
[keyword-search example](https://github.com/davidteather/TikTok-Api/blob/main/examples/video_keyword_search_example.py).
There is no OpenAI, Apify or Google request in this workflow, no provider API key,
no paid proxy, no video download and no frontend or endpoint integration.
TikTokApi is unofficial: a local browser/session can be blocked even when setup
is correct. Successful installation is not proof that live search works.

## Setup

From the updated **main** checkout (this task uses
`/Users/shana/.codex/worktrees/backend-main/melloway`), with Python 3.9+ and Node
22.13+ available:

```sh
python3 -m venv .local/discovery/tiktokapi-venv
.local/discovery/tiktokapi-venv/bin/python -m pip install -r scripts/tiktokapi-requirements.txt
PLAYWRIGHT_BROWSERS_PATH=.local/discovery/playwright .local/discovery/tiktokapi-venv/bin/python -m playwright install chromium
npm install
```

The virtual environment, downloaded browser, queues and exports are gitignored.
The npm dependencies and lockfile are unchanged; `npm install` is only needed
when preparing a fresh checkout. Python test fixtures use the standard library
and do not need TikTokApi, Chromium, credentials or internet access.

## Try one café

```sh
npm run discovery:tiktok -- --queue .local/discovery/tiktok-review-queue.json sydney-matchaya "MATCHA-YA" "Haymarket"
npm run discovery:review -- --queue .local/discovery/tiktok-review-queue.json list
```

`discovery:tiktok` is an **explicit real TikTok search**, loading the root `.env`
if present. Mock discovery remains the default elsewhere; setting a cookie does
not start a search. This provider does not call the existing OpenAI adapter or
the teammate's `/api/social/search` endpoint.

Each run uses one browser session, one keyword-search request, the first page
of up to 10 records, at most five matching candidates, a 40-second Python
deadline and a 45-second parent deadline. TikTokApi session recovery is disabled;
`retries=1` means **one total attempt** in the pinned library. Browser startup
loads TikTok resources as well; this is not a limit of one total HTTP request.
There is no pagination or automatic rerun.

Returned captions must mention both the supplied café name and suburb. The query
itself is never evidence. URLs are constructed only from actual returned string
post IDs/usernames; IDs are never guessed. Every match is pending, tentative and
traceable to that returned caption. Reruns preserve earlier decisions and do not
duplicate venue/platform/post identities. Unknown locations/coordinates are
never invented. The bot does **not** watch/transcribe videos or discover café
addresses; it starts from the venue you supply.

## Optional session cookie

An anonymous session is tried when no cookie is configured. If session/search
fails, the command reports failure rather than pretending it found zero videos.
The maintainer documents `msToken` as a cookie from your own TikTok browser session.

1. Visit TikTok normally in your browser and perform the café search yourself.
2. In browser developer tools, find **Application → Cookies → tiktok.com →
   msToken** (Chrome/Edge; browser labels may differ).
3. Put only that value in your **local root `.env`**:
   `TIKTOK_MS_TOKEN=your_cookie_value`. Preserve all other environment values.
4. Run the same command once when ready. The cookie may expire and does not
   guarantee TikTok will accept automated requests.

Treat this value as private session data. Do not paste it into chat, commit it,
put it in a command-line argument or export your entire browser cookie store.
The adapter passes only this cookie and runtime variables to Python; private
OpenAI/Ticketmaster/Google credentials are excluded. Library stdout/stderr and
exception details are suppressed. No CAPTCHA solving, paid proxies or other
block-circumvention fallback is implemented.

### Empty search responses

`EMPTY_RESPONSE` means the library received a blank response instead of search
JSON. This is a failure, not a successful search with zero matches. It does not
establish that your cookie is invalid or expired. The CLI saves no candidates
and does not automatically retry. A working browser session alone does not prove
this unofficial search endpoint will return usable videos. Repeatedly pasting
cookies or rerunning the command is not a confirmed fix.

For results that already load in your normal browser, use the separate
[browser capture/import workflow](TIKTOK_BROWSER.md). It reads displayed links
and captions and imports them offline; it does not replay this failing endpoint
or imply that automatic TikTokApi search has been fixed.

If the optional environment was installed elsewhere, set `TIKTOK_PYTHON` in the
root `.env` to that virtual environment's Python executable. The browser still
belongs in `.local/discovery/playwright` for this checkout.

## Review and export

Use IDs from `list`; discovery never approves its own suggestions:

```sh
npm run discovery:review -- --queue .local/discovery/tiktok-review-queue.json approve CANDIDATE_ID
npm run discovery:review -- --queue .local/discovery/tiktok-review-queue.json reject OTHER_CANDIDATE_ID
npm run discovery:review -- --queue .local/discovery/tiktok-review-queue.json export .local/discovery/tiktok-approved.json
```

Export contains approved records only. It does not publish or import into the
app. This is a private local curation tool, not secure multi-user moderation.
Keep uncertain matches pending or reject them; caption text is not verification
that the video features the venue. Use the venue's independently established
coordinates for future map integration, not a video's posting country.

## Verification

```sh
npm run test:tiktokapi
npm test
npm run typecheck
npm run build
```

All automated checks use clearly labelled fictional records and injected mocks.
No automated test launches a browser, calls TikTok or calls a paid provider.
Validation on 11 October 2026:

- Updated-main baseline: 217 npm tests, typechecking and build passed before edits.
- Integrated `npm test`: **228 tests passed** (145 JavaScript, 35 events, 48 discovery).
- `npm run test:tiktokapi`: **11 Node tests + 7 Python tests passed**; fixture-only
  subprocesses also verify credential isolation and cancellation.
- `npm run typecheck` and `npm run build`: passed. The existing Vite large-chunk
  warning remains; frontend assets/configuration/dependencies were not changed.
- One explicit anonymous live attempt for **MATCHA-YA, Haymarket** ran through the
  CLI and failed with the sanitized search/blocked-response error. **No candidates
  were saved and no queue file was created.** The available result does not prove
  which TikTok restriction caused the failure, or that supplying `msToken` fixes it.
  No automatic retry, paid provider call, proxy or real candidate approval occurred.
- A user-authorized saved-cookie run also failed without saving candidates. One
  subsequent bounded diagnostic confirmed browser/session creation succeeded and
  the single search request received **HTTP 200 with an empty body**, causing
  TikTokApi's `EmptyResponseException`. No response JSON or video data was
  available. This establishes the failure point; it does not establish why TikTok
  sent a blank body or whether the cookie is valid. The CLI now reports this
  specific failure without exposing raw library errors or session data.
- Useful live results remain **unverified**. No further live retry was made after
  that diagnostic. There is no map import, video transcription or location
  extraction in this task.

Follow-up empty-response fix, also on 11 October 2026:

- `npm run test:tiktokapi`: **12 Node tests + 8 Python tests passed**.
- `npm test`: **244 tests passed** (160 JavaScript, 35 events, 49 discovery),
  including the latest main catalogue/frontend commits preserved before this fix.
- `npm run typecheck` and `npm run build`: passed; the existing Vite large-chunk
  warning remains. All automated tests used mocks, with no live browser/provider
  requests. No real phone or useful live-video result was verified.
- Only `scripts/tiktokapi_search.py`, `server/tiktokDiscovery.ts`, their two test
  files and this document changed for the follow-up. Frontend, dependencies,
  lockfile, credentials and generated research are unchanged.

Changed files for the original adapter: `.env.example`, `.gitignore`, `package.json`,
`scripts/discovery-review.ts`, `scripts/tiktokapi_search.py`,
`scripts/tiktokapi-requirements.txt`, `server/tiktokDiscovery.ts`,
`tests/tiktok-discovery.test.ts`, `tests/python/test_tiktokapi_search.py`,
`docs/TIKTOKAPI.md`. The optional virtual environment/browser are local ignored
setup files; the root lockfile and all frontend files are unchanged.
