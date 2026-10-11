# TikTok café population

This is a separate Sydney discovery catalogue and Google map, accessible from the Expo landing screen's **TikTok places map** button. It does not change the planner's demo venues or invent prices, hours, routes or ratings.

Set these server-only values in the ignored root `.env`:

```dotenv
OPENAI_API_KEY=your-server-key
OPENAI_DISCOVERY_MODEL=gpt-5.6-sol
GOOGLE_MAPS_API_KEY=your-server-places-key
```

The Google server key needs Places API (New), billing, and appropriate server/API restrictions. The existing separate `GOOGLE_MAPS_DEMO_KEY` renders the Google JavaScript map preview; never substitute it for the private Places key. Native clients only receive their absolute `EXPO_PUBLIC_API_URL`, saved post metadata and current display locations. The server preflights both private keys before any paid discovery request.

Run explicitly from the repository root:

```sh
npm run discovery:populate
# Explicitly retry the default query after an empty result or provider failure:
npm run discovery:populate -- --retry
# A different, explicit discovery query for a later batch:
npm run discovery:populate -- "Sydney inner west cafés on TikTok"
# Retry that same query after fixing a bug:
npm run discovery:populate -- --retry "Sydney inner west cafés on TikTok"
```

One run makes one GPT-5.6 Responses request with low reasoning effort, at most two cache-only web searches restricted to `tiktok.com`, and at most five Google Places text searches. It finds up to five **different cafés**, with one full TikTok video or photo post URL per café. It does not require supplied café names. Full URLs must appear in the search tool's actual returned sources; model-reported evidence must mention the café and suburb. Public search indexing may return fewer than five or zero. This is not TikTok's internal app search, and it does not scrape, watch or download posts.

Location matching requires a unique Google result with the same café name and suburb, an operational café/restaurant/bakery type, a NSW/Australia address and valid Sydney coordinates. Ambiguous or failed matches have no pin. Matching establishes the location; the TikTok-to-café association remains marked **awaiting review**.

The ignored `.local/discovery/tiktok-places.json` stores TikTok café name/suburb, source and canonical URLs, post ID, reported evidence, Google Place ID, discovery time, pending status, and search history/returned token usage. It does **not** persist Google address/location content or API credentials. Display addresses and coordinates are fetched fresh from Place Details. [Google permits retaining Place IDs and requires Google attribution for displayed Places content](https://developers.google.com/maps/documentation/places/web-service/policies).

Each query is saved as attempted **before** its paid call. Repeating the same query (case/spacing variations included) does no work by default. An explicit `--retry` permits another bounded attempt after a failed run, an empty result, or failed Google matching. The prior attempt and usage remain in history. Successful runs without lookup failures and interrupted attempts still skip; an active or stale lock must be resolved before another run. A retry can reconsider the same query's previously unmatched candidates, while all saved cafés/posts and other queries' unmatched candidates remain excluded. Duplicate post IDs and Google Place IDs are never saved twice. Storage is private, atomically written and locked against competing runs. Corrupt storage is rejected rather than erased. There are no automatic retries, fill-the-list loops or background discovery jobs.

`GET /api/tiktok-places` serves the ten most recently saved places; `GET /api/tiktok-places-map` renders their available locations on Google Maps. Refreshing this screen reads saved discoveries and fetches current Google details; it never calls OpenAI or repeats TikTok discovery. Google detail/map usage may still incur provider charges. Restart `npm run server` after changing `.env`, then refresh the Expo screen. The JSON response and map page contain no private API keys.

Automated validation uses injected synthetic provider responses and temporary catalogues, never real paid searches or fake records in the live catalogue. Native bundle exports are not iOS/Android device builds.

On 2026-10-11, live Places text search and Place Details both returned HTTP 200 with coordinates. The first explicit `gpt-5.6-sol` batch (`Sydney cafés and brunch spots`) completed with two search calls but zero verifiable TikTok candidates and no saved pins. This confirms Google access, not useful live TikTok discovery. The attempted query remains recorded and can be explicitly retried with `--retry` after fixing discovery; do not erase history to retry. Optional omitted search source lists are treated as no evidence; generated URLs are still excluded.
