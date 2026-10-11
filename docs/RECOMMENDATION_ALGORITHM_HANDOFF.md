# Recommendation algorithm handoff

Saved 11 October 2026 (Australia/Sydney).

## Resume instruction

The user asked to pause the new recommendation-engine brief and push the existing completed work first. Do not claim the new brief is implemented. Resume it when the user asks to continue. Preserve current screens, the original wireframe, phone-first styling, fonts, supplied doodles/logos, and the existing Expo app.

## Completed work to preserve

- Explore contains suggestions; Feed is for user posts; What’s On is establishment/group events with lower navigation priority. Suggestions were moved out of the itinerary into Explore; the itinerary retains its add-stop flow.
- Google Maps support and offline map fallback; swipe suggestions follow their exact venue coordinates; map markers have previews; visible nearby-loading states and prominent add-stop controls.
- Existing onboarding: one question at a time, consistent text placement, correct Back trail, optional calendar/time, typeable age and budget, Sydney location search/map, cuisine/atmosphere choices, automatic activity-budget split with optional edits, and the five animated vibe-check selections.
- Existing community/profile flows: simple post feed, expanded route with actual place names, location details/social posts, Twitter/Threads-inspired profile, icon tabs, and editable profile.
- melloway picks include the five-stop Sydney Matcha Crawl with correct branches, timing and estimated walking. Weekly suggestions include Macquarie Ice Rink, Astro’s arcade bar and Caterpillar Club.
- Multi-source recommendation evidence from the four supplied editorial/Reddit pages, bounded optional OpenAI web research, verified evidence matching before ranking, branch/service-business filtering, and source explanations. Do not fabricate social engagement or claim unrestricted Instagram/TikTok scraping.
- Explicit route lifecycle: upcoming/in-progress/completed; favourites are separate bookmarks. Finish opens a dismissible completion sheet and clears the active route from Home. Past Dates preserves immutable snapshots, private overall/spot ratings and reviews, favourites, and separately scheduled editable copies. In-progress routes survive reloads. Completion is never inferred from end time.
- History/reviews and the current community feed are local to the device. Sharing opens a composer and requires its separate Post action; do not represent this as public multi-user publishing or cloud-synced review storage.

## Implementation entry points

- Current web planning: `src/engine/`, `src/services/discovery.js`, `src/utils/planner.js`, `src/data/sydneyVenues.js`.
- Current evidence: `src/data/recommendationSources.js`, `src/engine/recommendationEvidence.js`, `server/recommendationResearch.js`, `src/components/RecommendationEvidence.jsx`.
- Lifecycle/history: `src/utils/routeHistory.js`, `src/hooks/useApp.jsx`, `src/components/CompletionSheet.jsx`, `src/pages/History.jsx`.
- Expo app: `apps/mobile/`; shared domain: `packages/domain/`. Inspect their boundaries before extending them. Do not replace the newer web engine with an older standalone shared planner.
- Keep the isolated discovery-review CLI separate from runtime app recommendations, as required by `AGENTS.md`.

## Validation at this checkpoint

Before this push, the completed work passed 407 automated tests, typechecking, the production build, and 35 distinct affected browser checks across planning, profile, route editing and completion/history. Browser/provider tests use offline fixtures, including Google, OpenAI and Supabase, and never make paid API calls. These are Chromium phone viewport checks, not a native iOS device test. The build retains its existing large-chunk warning.

The push checkpoint also integrates teammate main through `a286d23`, preserving the Picks map/photo explorer, shared Hack48 event, discovery CLI and social updates. After integration, all 428 automated tests, typechecking and the build passed; all 33 selected browser regressions passed across history, recommendation research, Picks, Hack48, social posts and events (saved-Picks and social fixtures rechecked after the initial run).

The final fetch also included teammate route-geometry/map-framing updates through `806e81f`. Both additive API endpoints were retained. The full automated suite, typechecking and build passed again, plus 18 affected Google-map/history browser checks; the preserved Picks explorer also passed its five browser checks after its Back link was aligned with Explore.

## Pending brief and evidence gaps

The full new brief is preserved below. Main pending work: richer multi-category venue profiles and verification states; configurable compatibility-first scoring; better intent/vibe interpretation; cohesive activity sequencing, meal/market/sunset timing and constrained routing; controlled diversity using prior/rejected venues; concise personalised explanations; legitimate social metadata; and the eight requested scenario tests/results.

The text lists venue names and contextual claims, but this message did not attach the five TikTok screenshots or their original post URLs. Treat those names as user-supplied discovery leads, not verified TikTok evidence. Verify names (including ambiguous entries such as “Atki” and “Bar Herbs”), branches, locations, operating status and hours before presenting facts. Happy-hour claims remain unverified until confirmed from current reliable sources. Never invent missing prices, promotions, engagement, or source links. User wants relevance, not popularity, and no UI redesign.

## User brief (verbatim)

Here’s a stronger prompt for Codex that focuses on significantly improving melloway’s recommendation algorithm using real Sydney recommendations from TikTok, rather than simply adding more locations to a database.

The goal is to make melloway understand why people recommend certain places, who those places are suitable for, and how to combine them into personalised itineraries.

Copy this prompt into Codex and attach the five screenshots.

⸻

Codex Prompt — Significantly Improve melloway’s Recommendation Algorithm

I want you to SIGNIFICANTLY improve melloway’s existing itinerary recommendation algorithm using the attached TikTok screenshots as a starting point for a curated Sydney location database.

Currently, melloway generates itineraries based on basic categories, preferences, geographic distance, and budget. While functional, the recommendations are often too generic and don’t capture what makes a location genuinely appealing.

I want melloway to recommend places the way someone who spends hours discovering hidden gems on TikTok, Instagram, and Google Maps would.

The goal is not to recommend the most popular places. It’s to recommend the most relevant places for each user.

1. Expand the Sydney Location Database

Use the attached TikTok screenshots to create a structured dataset of recommended Sydney locations.

The screenshots contain five categories:

🍝 Fancy Dinners

* Matteo Downtown / Matteo Double Bay
* Hugos Manly
* Neptune’s Grotto
* Totti’s
* Raw Bar Bondi
* Alegre Barangaroo
* Mr Wong
* Atki
* Sails Lavender Bay
* Doyle’s Watsons Bay
* Ormeggio Mosman

🌊 Beaches and Coastal Activities

* Redleaf Pool — swimming, snacks, beach atmosphere.
* McCallum Pool — scenic views, limited nearby food options.
* Coogee Beach — swimming and plenty of nearby cafés.
* Bondi Beach — iconic beach destination.
* Camp Cove — scenic views and nearby food options.

🌆 Scenic Views and Romantic Locations

* Sydney Opera House / Opera Bar
* Café Sydney — Harbour Bridge and Opera House views.
* Sydney Harbour Bridge — BridgeClimb or a free walk from Milsons Point.
* Observatory Hill — picnics and city views.
* Mrs Macquarie’s Chair — harbour views.
* Darling Harbour — waterfront activities and potential fireworks.

💐 Markets

* Carriageworks Farmers Market — flowers, fresh produce, coffee, and pastries.
* The Rocks Markets — food, shopping, and harbour atmosphere.
* Orange Grove Market — affordable produce.
* Flemington Markets — flowers and fresh produce.
* Bondi Markets / Manly Markets — baked goods, flowers, and shopping.
* Glebe Markets — vintage clothing, food, and music.
* Rozelle Markets — vintage clothing and homewares.
* Paddington Markets — fashion, plants, flowers, and accessories.
* Kirribilli Markets — clothing, art, matcha, and independent stalls.

🍸 Happy Hours and Cocktail Bars

* Maybe Sammy — The Rocks.
* Employees Only — Sydney CBD.
* Bar Herbs — Sydney CBD.
* The Morrison — Sydney CBD.
* Dean & Nancy — Sydney CBD.
* Menzies Bar — Sydney CBD.
* Restaurant Hubert — Sydney CBD.

The screenshots also mention specific happy-hour prices and times.

Do not assume these promotions are currently valid. Store them as unverified social-media claims until confirmed through reliable, current sources.

Similarly, verify venue names, addresses, operating status, and opening hours before presenting them as factual.

If verification is unavailable, retain the recommendations as curated candidates with an appropriate verification status.

2. Introduce a More Detailed Venue Classification System

The existing algorithm relies too heavily on broad categories.

For example, categorising both Restaurant Hubert and a casual noodle shop as “dinner” ignores the fact that they offer completely different experiences.

I want each location to have detailed attributes.

Example:

{
  id: "restaurant-hubert",
  name: "Restaurant Hubert",
  suburb: "Sydney CBD",
  categories: ["restaurant", "french", "dinner"],
  vibes: [
    "romantic",
    "intimate",
    "fancy",
    "vintage",
    "date-night"
  ],
  activities: [
    "fine-dining",
    "cocktails",
    "live-music"
  ],
  priceTier: "premium",
  suitableFor: [
    "first-date",
    "anniversary",
    "romantic-dinner"
  ],
  source: {
    platform: "tiktok",
    type: "community-recommendation",
    verified: false
  }
}

This is an illustrative schema, not a claim that every listed attribute has been verified.

Build a flexible tagging system that allows each venue to belong to multiple categories.

3. Understand User Intent Beyond Keywords

I want melloway to interpret preferences intelligently.

For example, if a user selects:

“Romantic + Fancy Dinner + Speakeasy”

The algorithm should understand that they probably want:

* Intimate atmospheres.
* Upscale restaurants.
* Cocktail bars.
* Dim lighting.
* An evening itinerary.
* Locations reasonably close together.

It should NOT recommend random popular restaurants simply because they serve dinner.

Similarly:

“Thrifting + Matcha + Cute Date”

Should prioritise:

* Vintage stores.
* Matcha cafés.
* Markets.
* Bookshops.
* Walkable neighbourhoods.
* Relaxed daytime activities.

Build a preference interpretation layer that maps user interests to relevant venue attributes.

4. Improve the Recommendation Scoring Algorithm

Implement a weighted scoring system that considers:

Factor	Suggested weight
User preference compatibility	30%
Atmosphere and vibe compatibility	20%
Geographic proximity	15%
Budget compatibility	10%
Venue quality and community feedback	10%
Activity variety	10%
Social media relevance	5%

These weights are starting points, not final values.

Make them configurable so we can adjust them based on user testing.

Important: A location should not automatically rank higher because it has more TikTok views or Google reviews.

Social media popularity should support recommendations, not determine them.

Apply hard constraints such as operating hours and budget before ranking feasible options.

5. Make Itineraries Feel Intentionally Curated

This is one of the most important improvements.

I don’t want melloway to select four highly rated places and arrange them randomly.

I want the application to create a cohesive experience.

For example:

Scenario A — Fancy Sydney Date

User preferences: Romantic, fancy dinner, cocktails.

An appropriate itinerary could follow:

Hidden cocktail bar → Fine dining → Scenic evening walk.

The algorithm should recognise that these activities complement each other.

Scenario B — Cute Weekend Date

User preferences: Flowers, markets, matcha, vintage shopping.

An appropriate itinerary could follow:

Morning market → Matcha café → Vintage shopping → Casual lunch.

Scenario C — Beach Date

User preferences: Beaches, sunset, affordable food.

An appropriate itinerary could follow:

Beach → Coastal walk → Casual dinner → Sunset viewpoint.

The algorithm must consider timing, travel distance, activity duration, and location availability.

6. Significantly Improve Route Optimisation

Do not optimise solely for geographic distance.

The best itinerary is not necessarily the shortest itinerary.

Consider:

* Walking and public transport times.
* Venue opening hours.
* Event schedules.
* User start time.
* Meal timing.
* Estimated activity duration.
* Geographic proximity.
* Budget.
* User preferences.

For example, a Saturday market should be scheduled during its actual operating hours, not in the evening.

A sunset viewpoint should be scheduled around sunset, not at midday.

A fancy dinner should not be scheduled immediately after breakfast.

Use an appropriate graph-search or constrained optimisation approach.

When real routing APIs are unavailable, clearly label estimated travel times and avoid claiming that the route is mathematically optimal.

7. Introduce Social Media Relevance

This is a major part of melloway’s identity.

We want to turn the experience of discovering places through TikTok and Instagram into actionable itineraries.

Each venue should support social discovery metadata such as:

{
  socialDiscovery: {
    platforms: ["tiktok", "instagram"],
    recommendationCount: null,
    communityRating: null,
    visualMedia: [],
    sourceLinks: [],
    lastVerified: null
  }
}

Use legitimate APIs, licensed content, or user-submitted links where available.

Do not fabricate engagement statistics or scrape platforms in ways that violate their terms.

Eventually, users should be able to discover a location through a TikTok or Instagram post and save it directly into melloway.

The application should then help organise that location into a realistic itinerary.

8. Explain Why Each Location Was Recommended

Every itinerary stop should include a short, personalised explanation.

For example:

Restaurant Hubert

“we picked this because you’re into romantic dinners, intimate spaces, and a little bit of old-school charm.”

Glebe Markets

“you said you love thrifting, so we thought you’d enjoy browsing vintage finds and grabbing something to eat.”

Observatory Hill

“you wanted something romantic without spending too much. this one’s for the views.”

Avoid generic descriptions such as “popular location with good reviews.”

9. Improve Recommendation Variety

Don’t recommend the same locations repeatedly.

Introduce controlled diversity so users can discover new places while still receiving relevant recommendations.

For example, if a user repeatedly selects romantic restaurants, melloway should explore different suitable restaurants rather than always recommending Restaurant Hubert.

However, do not sacrifice relevance simply to introduce variety.

Regenerated locations must still satisfy the user’s constraints.

10. Test the Algorithm Against Real Scenarios

Create automated tests for:

Test 1: Romantic dinner and speakeasies in Sydney CBD.

Test 2: Matcha and thrifting in Newtown.

Test 3: Beaches and sunset views in the Eastern Suburbs.

Test 4: Saturday markets and flowers in the Inner West.

Test 5: Affordable romantic date under $50.

Test 6: Fancy dinner with a $200 budget.

Test 7: User requests a market on a day when it is closed.

Test 8: User rejects a recommended venue and requests an alternative.

For each test, evaluate whether the itinerary is geographically sensible, within budget, compatible with the selected preferences, and feasible at the requested time.

11. Technical Implementation

Before writing code, inspect the existing melloway codebase.

Identify the current recommendation engine, location dataset, route optimiser, and itinerary generation logic.

Improve these existing systems rather than creating an entirely separate implementation.

Separate the logic into reusable modules for:

* Venue data.
* Preference interpretation.
* Recommendation scoring.
* Constraint filtering.
* Activity sequencing.
* Route optimisation.
* Itinerary generation.
* Recommendation explanations.

Preserve the existing React Native and Expo architecture.

Do not redesign the user interface.

Keep my original wireframe structure, HEYTEA-inspired visual styling, and Inyo-inspired interactions.

Focus on improving the quality of recommendations.

12. Expected Outcome

After these changes, melloway should generate itineraries that feel like they were thoughtfully curated by someone who genuinely knows Sydney.

The recommendations should reflect:

* The user’s interests.
* Their preferred atmosphere.
* Their budget.
* Their location.
* Their available time.
* Realistic travel routes.
* Relevant social media discoveries.
* Community recommendations.

I don’t want melloway to become another Google Maps.

Google Maps helps people find places.

melloway should help people discover experiences that match their personalities and turn those discoveries into actionable plans.

Implement the improvements, add tests, and demonstrate the results using the supplied scenarios.

⸻

One additional improvement I’d recommend

Your screenshots reveal something particularly valuable: people aren’t just recommending locations. They’re recommending locations with context.

For example, one beach is recommended because there are snacks nearby, while another is recommended for its views despite having fewer food options.

That distinction matters.

I’d eventually introduce a feature called “the vibe check”, where melloway explains not just what a place offers, but why someone might enjoy it.

For instance:

🌊 McCallum Pool
for the views, not the food.

💐 Carriageworks Markets
flowers, pastries, and a slow saturday morning.

🍝 Restaurant Hubert
when you want to impress without trying too hard.

That’s how melloway can turn social media inspiration into something more useful than another list of popular Sydney destinations.
