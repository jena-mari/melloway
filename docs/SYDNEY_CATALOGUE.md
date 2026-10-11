# Sydney catalogue expansion — checked 11 October 2026

Added 15 distinct records to `src/data/sydneyVenues.js`, retaining the original 21.
Names, addresses and hours come from the linked operator/council sources. Every
addition has a separate coordinate source in `sources`, with the fields that it
supports. Coordinates are approximate venue/building or park-centre positions,
not surveyed entrances. No reviews, ratings or photos were added.

The amounts below are **editorial AUD allowances per person**, not advertised
prices, minimum spends or guaranteed ticket costs. Durations are **estimated
visits**, not reservations or film runtimes. Café food allowances use the existing
`foodAllowance` filtering when a brunch/food preference is selected.

| Group | Location | Area | Allowance | Visit | Operator evidence / limitation |
| --- | --- | --- | --- | --- | --- |
| Food | Black Star Pastry Newtown | Newtown | $18 cake and drink | 35 min | [Locations](https://blackstarpastry.com/pages/locations): current King Street branch; weekday/weekend windows differ. |
| Food | Rising Sun Workshop | Newtown | $35 meal | 60 min | [Contact](https://risingsunworkshop.com/contact): restaurant hours, including service breaks; Fri/Sat dinner excluded because closing time is unspecified. |
| Food | Single O Surry Hills | Surry Hills | $10 drink / $30 food | 40 min | [Cafés](https://singleo-au.com/pages/cafes): Reservoir Street; weekend opening is later. |
| Food | Reuben Hills | Surry Hills | $10 drink / $35 food | 45 min | [Operator](https://www.reubenhills.com.au/): Albion Street, walk-ins only. |
| Food | Edition Roasters Darling Square | Sydney CBD / Haymarket | $12 drink / $35 food | 45 min | [Stores](https://editionroasters.com/stores/): use operator address/hours; older precinct listing differs. No unverified matcha tag. |
| Activity | The Cipher Room Newtown | Newtown | $80 | 90 min | [Operator](https://www.cipherroom.com.au/): King Street branch; Monday opens at 5pm. Book a real room/session; availability unconfirmed. |
| Activity | Escape Hunt Sydney | Sydney CBD | $70 | 90 min | [Find us](https://escapehunt.com/au/sydney/find-us/): George Street, daily 10am–8:30pm. Book a session; briefing is included in the allowance. |
| Activity | Timezone Haymarket | Sydney CBD / Haymarket | $30 game credit | 60 min | [Venue](https://www.timezonegames.com/en-au/venues/nsw/timezone-haymarket/): Level 3 Market City. Recurring structured hours are Mon–Thu 10am–midnight, Fri–Sun 9am–midnight; dated listings can open earlier, so the conservative recurring window is retained. |
| Activity | Golden Age Cinema & Bar | Surry Hills | $40 | 120 min | [Information](https://www.ourgoldenage.com.au/info), [program/bar](https://www.ourgoldenage.com.au/): film/event dates vary and hours end “till late”. **Not automatically scheduled.** |
| Activity | Hyde Park Barracks | Sydney CBD | $0 general entry | 90 min | [Visit](https://mhnsw.au/visit-us/hyde-park-barracks/), [free entry/audio guide](https://mhnsw.au/kids-trails/): 10am–6pm, last entry 4:30pm. The estimated duration enforces that last arrival. |
| Explore | Camperdown Memorial Rest Park | Newtown | $0 casual access | 45 min | [Council](https://www.innerwest.nsw.gov.au/newtown-parks/camperdown-memorial-rest-park): no complete park opening window. **Not automatically scheduled.** Dog off-leash hours are not opening hours. |
| Explore | Hyde Park | Sydney CBD | $0 casual walk | 45 min | [Council](https://www.cityofsydney.nsw.gov.au/parks/hyde-park): no complete opening window; lighting works noted. **Not automatically scheduled.** |
| Explore | Anzac Memorial | Sydney CBD | $0 admission | 45 min | [Hours/admission](https://www.anzacmemorial.nsw.gov.au/hours-and-admission), [location/entrance](https://www.anzacmemorial.nsw.gov.au/plan-your-visit/getting-memorial): 9am–5pm; special ceremonies may affect access. |
| Explore | Chinese Garden of Friendship | Sydney CBD / Darling Harbour | $20 admission | 60 min | [Operator](https://www.darlingharbour.com/precincts/chinese-garden): ticketed, 10am–5pm; dining extra. |
| Explore | Australian Museum | Sydney CBD | $0 general entry | 120 min | [Visit](https://australian.museum/visit/): 10am–5pm; major exhibitions and food extra. |

Hyde Park Barracks, Anzac Memorial and the Chinese Garden close on Christmas Day
and Good Friday; the Australian Museum closes on Christmas Day. Those closures
use the existing schema and calendar checks. General opening windows do not
confirm escape-room, cinema or event availability. Travellers must confirm
changes, holiday hours and reservations with operators.

Coordinates for Rising Sun Workshop and Escape Hunt use Destination NSW's public
location records. The other additions use the individual OpenStreetMap features
linked in their `sources`; Timezone uses the Market City building position
published by Mapcarta. Coordinate data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
Only these limited factual point positions were retained, with per-record
attribution; no map imagery or source descriptions were copied. Do not strip
coordinate provenance/attribution when exporting the catalogue.

Google Places discovery remains in its existing provider adapter, separate from
these curated records. No Google Places fields, photos or reviews were copied
into the permanent catalogue. No new fetcher, scraper, database, provider call
or routing rule was added.

`tests/catalogue-expansion.test.js` uses the actual catalogue with the existing
filtering, scheduling and itinerary engine, and labelled geographic travel
estimates. It covers several feasible outings, each new free museum, food
allowances, unknown hours, service breaks, Monday restrictions, holiday closures,
last entry, deduplication, provenance, regeneration and requests that must remain infeasible.
The tests make no external or paid API calls; source verification is manual.
