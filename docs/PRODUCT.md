# Melloway

**Less planning, more chemistry.** Melloway helps young adults discover Sydney places and plan a complete day out, without coordinating everything across social feeds, maps and event websites.

## People and experience

Our audience is primarily Gen Z and young adults arranging first dates, romantic dates, best-friend dates, girls' days out, group hangouts and spontaneous adventures. Users choose their company, type of outing, starting area, date/time window, per-person budget, transport, interests and vibe. Melloway proposes ordered stops with arrival times, visit durations, estimated costs and travel information, with a map to orient them. Users can inspect venues, replace a stop, regenerate and save a plan.

## Sydney first

Initial discovery is exclusively Sydney: cafés, restaurants, galleries, museums, attractions, markets, beaches and activities. Neighbourhood preferences should make an outing practical rather than send people across the city for every stop. Events will follow when an actual events provider is integrated. Demo data is illustrative; sample venue hours and budget allowances do not establish current availability or prices.

## Community discovery

Future members can share reviews, photos, TikTok/Instagram Reel links and entire itineraries. Following people with similar interests should surface recommendations supported by first-hand experiences. Community relevance should complement personal preferences and geographical feasibility. The current web community consists of fictional starter posts and device-local memories. Native community, public reviews, video links, moderation and user accounts are later milestones. We will accept user-submitted links; we will not scrape social platforms.

## Planning now and later

The current planner filters and scores demo or Google venues, then searches bounded DFS paths of three to five stops. It honours the per-person budget (including sample transport allowances), opening windows, visit/travel durations and the available time window. It chooses among at most 14 candidates with a 120,000-node bound. This is not globally optimal routing. Demo edges use geographic distance estimates; live edges use Google Routes when configured. The current starting area is a search bias/coverage filter; travel from the user's actual origin and a return journey are not scheduled yet.

Future itinerary optimisation must consider personal interests and vibe, community recommendations, budget, actual opening hours/exception dates, realistic activity durations, travel times, true origin/destination, start/finish times, transport methods, accessibility and reservation/event availability where supported. Revisit scoring and search strategy only after measuring quality and preserving constraint tests. Community weights should be evidence-backed and resistant to spam.

## Technology and collaboration

Mobile: React Native, Expo, TypeScript, Expo Router, Reanimated and Gesture Handler. Zustand owns local app state and TanStack Query owns asynchronous service work. Maps use react-native-maps, with Google Maps on Android and configurable Google Maps on iOS; Expo Go iOS uses Apple Maps for credential-free preview. Places/Routes calls remain server-side. Supabase PostgreSQL, PostGIS, Auth and Storage are the intended backend foundation; the existing Node adapter remains available during migration. NativeWind is optional when it benefits styling; this milestone uses shared StyleSheet tokens.

Backend work covers data models, integrations, algorithms, routing and tests. Frontend work covers native screens, visual styling, animation, interaction and map polish. Shared domain types and provider interfaces let both developers work independently. Payments, AI, public social features and authentication are outside the first migration milestone.
