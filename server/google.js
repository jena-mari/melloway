import { categories } from "../src/data/preferences.js";
import { inSydney, planningArea, sydneyBounds } from "../src/utils/location.js";
import { attachRecommendationEvidence, matchesLead, eventServiceOnly } from '../src/engine/recommendationEvidence.js';
import { curatedVenuesForDate } from "../src/data/sydneyVenues.js";
import { interpretPreferences } from "../src/engine/preferences.js";
import { venueRejection } from "../src/engine/filtering.js";
import { extractRequestedActivities, matchesRequestedActivity, outdoorActivityVenue } from "../src/engine/requestedActivity.js";
import { km, transportAllowance } from "../src/utils/planner.js";
import { allocateActivityBudgets } from "../src/utils/activityBudget.js";
import { outingInstant } from "../src/utils/date.js";
import { freeAdmissionEvidence } from './freeAdmission.js';
import { venuePriceLabel } from '../packages/domain/src/venuePricing.ts';

export function openingHours(periods) {
  const days = Array.from({ length: 7 }, () => []);
  const validTime = (point) => point && Number.isInteger(point.day) && point.day >= 0 && point.day <= 6 &&
    Number.isInteger(point.hour) && point.hour >= 0 && point.hour <= 23 &&
    (point.minute === undefined || (Number.isInteger(point.minute) && point.minute >= 0 && point.minute <= 59));
  for (const period of Array.isArray(periods) ? periods : []) {
    if (!period || typeof period !== "object") continue;
    const { open, close } = period;
    if (!validTime(open) || (close && !validTime(close))) continue;
    if (!close) {
      // Google's special representation for an always-open place.
      if (open.day === 0 && open.hour === 0 && !open.minute)
        days.forEach((day) => day.push({ open: 0, close: 1440 }));
      continue;
    }
    const start = open.hour * 60 + (open.minute || 0);
    const end = close.hour * 60 + (close.minute || 0);
    let span = (close.day - open.day + 7) % 7;
    if (!span && end < start) span = 1;
    const finish = end + span * 1440;
    days[open.day].push({ open: start, close: finish });
    // The preceding period also makes the following day available from midnight.
    for (let offset = 1; offset <= span; offset++) {
      days[(open.day + offset) % 7].push({
        open: 0,
        close: Math.min(1440, finish - offset * 1440),
      });
    }
  }
  return days.map((day) =>
    day
      .filter(
        (w) =>
          Number.isFinite(w.open) &&
          Number.isFinite(w.close) &&
          w.close > w.open,
      )
      .sort((a, b) => a.open - b.open),
  );
}

export function discoveryQueries(preferences) {
  if (!preferences.length)
    return ["Coffee shops", "Art galleries", "Scenic walks"];
  const groups = Object.values(categories).map((options) =>
    preferences.filter((tag) => options.includes(tag)),
  );
  const result = [];
  for (let i = 0; result.length < 4 && groups.some((group) => group[i]); i++) {
    for (const group of groups)
      if (group[i] && result.length < 4) result.push(group[i]);
  }
  return result;
}

function allowance(tag) {
  return tag === "Fine dining"
    ? 110
    : ["Speakeasies", "Cocktail bars"].includes(tag)
      ? 30
      : tag === "Photo booths"
        ? 12
        : /food|Dinner|Brunch|Italian|Asian/i.test(tag)
          ? 30
          : /caf|coffee|Matcha|Dessert/i.test(tag)
            ? 15
            : /Escape|Arcade|music|Jazz/i.test(tag)
              ? 35
              : 0;
}

// Coarse, conservative AUD planning allowances; price levels are not quotes.
const priceAllowances = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 20,
  PRICE_LEVEL_MODERATE: 45, PRICE_LEVEL_EXPENSIVE: 90, PRICE_LEVEL_VERY_EXPENSIVE: 150 };

export function createGoogleProvider(key, fetcher = fetch, { curated = curatedVenuesForDate, admissionEvidence = freeAdmissionEvidence } = {}) {
  async function google(url, body, mask) {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": mask,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Google provider unavailable");
    return response.json();
  }

  async function discoverResults(prefs, leads = null) {
    const area = planningArea(prefs);
    const activities = leads ? [] : extractRequestedActivities(prefs.notes);
    const intent = interpretPreferences(prefs);
    const catalogue = leads ? [] : curated(prefs.date || "");
    const curatedRejectedReasons = {};
    const eligibleCurated = catalogue.filter(v => {
      const reason = venueRejection(v, prefs, intent);
      if (reason) curatedRejectedReasons[reason] = (curatedRejectedReasons[reason] || 0) + 1;
      return !reason;
    });
    const curatedMatches = eligibleCurated.filter(v => activities.some(a => matchesRequestedActivity(v, a)));
    const activity = activities.find(a => !eligibleCurated.some(v => matchesRequestedActivity(v, a)));
    const tasks = leads
      ? leads.slice(0, 6).filter(lead => lead.tags?.length).map(lead => ({ tag: lead.tags[0], lead }))
      : discoveryQueries(prefs.preferences).map(tag => ({ tag }));
    // One extra request, no pagination/retries or targeted work in research resolution.
    if (activity) tasks.push({ tag: activity.query, targeted: true });
    const debug = { requestedActivity: activity?.query || activities[0]?.query || null, requestedActivities: activities.map(a => a.query), curatedCandidates: catalogue.length,
      eligibleCuratedCandidates: eligibleCurated.length, curatedRejectedReasons, curatedActivityMatches: curatedMatches.length,
      googleResults: 0, googleCandidates: 0, targetedQueries: tasks.filter(t => t.targeted).length,
      rejectedResults: 0, rejectedReasons: {}, rejections: [], unverifiedSuggestions: 0, failedQueries: 0 };
    const targetedVenues = new WeakSet();
    const pricingConflicts = new WeakSet();
    const reject = (reason, place, targeted) => {
      debug.rejectedResults++;
      debug.rejectedReasons[reason] = (debug.rejectedReasons[reason] || 0) + 1;
      debug.rejections.push({ id: typeof place?.id === "string" ? place.id : null, reason, targeted: !!targeted });
    };
    const settled = await Promise.allSettled(tasks.map(async ({ tag, lead, targeted }) => {
      const data = await google("https://places.googleapis.com/v1/places:searchText", {
        textQuery: lead ? `${lead.name}, ${lead.locality}, Sydney Australia`
          : `${tag === 'Photo booths' ? 'walk-in self-service photobooth studio' : tag} near ${area.name || prefs.area}, Sydney Australia`,
        pageSize: lead ? 2 : 6,
        ...(targeted && activity.placeType ? { includedType: activity.placeType, strictTypeFiltering: true } : {}),
        locationBias: { circle: { center: { latitude: area.lat, longitude: area.lng }, radius: Math.min(30000, area.r * 1000) } },
      }, "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours,places.photos,places.googleMapsUri,places.businessStatus,places.websiteUri,places.types,places.pureServiceAreaBusiness,places.priceLevel");
      if (data.places !== undefined && !Array.isArray(data.places)) throw new Error("Invalid Places response");
      const candidates = [];
      for (const p of data.places || []) {
        debug.googleResults++;
        const coords = { lat: p?.location?.latitude, lng: p?.location?.longitude };
        const identity = { name: p?.displayName?.text, providerTypes: Array.isArray(p?.types) ? p.types : [], source: "google" };
        const matchedActivity = activities.find(a => matchesRequestedActivity(identity, a));
        const activityMatch = !!matchedActivity;
        const outdoor = outdoorActivityVenue(identity, matchedActivity);
        let reason = !p || typeof p.id !== "string" || !p.id.trim() || typeof identity.name !== "string" || !identity.name.trim() ||
          typeof p.formattedAddress !== "string" || !p.formattedAddress.trim() ||
          (p.types !== undefined && (!Array.isArray(p.types) || p.types.some(t => typeof t !== "string"))) ? "identity" : null;
        reason ||= p.businessStatus !== "OPERATIONAL" && !(p.businessStatus === undefined && outdoor)
          ? "not-operational" : null;
        reason ||= !inSydney(coords) || km(coords, area) > area.r ? "location" : null;
        reason ||= p.pureServiceAreaBusiness === true ? "event-service" : null;
        reason ||= targeted && !matchesRequestedActivity(identity, activity) ? "activity-mismatch" : null;
        if (reason) { reject(reason, p, targeted); continue; }
        const weeklyHours = openingHours(p.regularOpeningHours?.periods);
        const knownHours = weeklyHours.some(day => day.length);
        const unverified = !knownHours && outdoor;
        if (!knownHours && !unverified) { reject("unknown-hours", p, targeted); continue; }
        const priceLevel = p.priceLevel;
        if (priceLevel !== undefined && priceLevel !== "PRICE_LEVEL_UNSPECIFIED" && !Object.hasOwn(priceAllowances, priceLevel)) {
          reject("invalid-price", p, targeted); continue;
        }
        const unknownPrice = !priceLevel || priceLevel === 'PRICE_LEVEL_UNSPECIFIED';
        const priceEvidence = unknownPrice ? admissionEvidence(p) : null;
        const free = priceLevel === 'PRICE_LEVEL_FREE' || !!priceEvidence;
        const cost = free ? 0 : Math.max(allowance(tag),
          priceAllowances[priceLevel] ?? (activityMatch ? (outdoor ? 20 : 35) : allowance(tag)));
        let venue = { id: p.id, name: identity.name, address: p.formattedAddress,
          website: p.websiteUri, providerTypes: p.types, pureServiceAreaBusiness: p.pureServiceAreaBusiness,
          area: prefs.area, ...coords, rating: p.rating,
          image: p.photos?.[0] ? "/api/photo?name=" + encodeURIComponent(p.photos[0].name) : undefined,
          attribution: p.photos?.[0]?.authorAttributions?.map(a => a.displayName).join(", "),
          tags: lead ? lead.tags : [...new Set([tag, ...(activityMatch ? [matchedActivity.query] : [])])],
          category: activityMatch ? matchedActivity.query : tag, weeklyHours, source: "google", cost,
          ...(activityMatch ? { roles: [matchedActivity.role] } : {}),
          hoursStatus: unverified ? "unverified" : "published", priceStatus: free ? 'free' : unknownPrice ? 'unknown' : 'estimate',
          priceLevel: priceLevel || null,
          ...(priceEvidence ? { priceEvidence } : {}),
          mins: tag === "Fine dining" ? 120 : ["Speakeasies", "Cocktail bars"].includes(tag) ? 60 : tag === "Photo booths" ? 15 : 45,
          note: "Discovered with Google Places. Estimated spend is a planning allowance, not a venue quote. Check the venue before visiting." +
            (unverified ? " Opening hours are unverified; this suggestion cannot be scheduled as confirmed open." : ""),
          mapsUri: p.googleMapsUri };
        venue.costLabel = venuePriceLabel(venue);
        if (free) venue.note = 'Free admission. Equipment, lessons and purchases are separate. Confirm current access before visiting.' +
          (unverified ? ' Opening hours are unverified; this suggestion cannot be scheduled as confirmed open.' : '');
        if (eventServiceOnly(venue)) { reject("event-service", p, targeted); continue; }
        if (activityMatch && !allocateActivityBudgets([venue], prefs, transportAllowance(prefs.transport))) {
          reject("budget", p, targeted); continue;
        }
        // Known weekly hours must fit the requested date/time too. Outdoor unknown
        // hours are retained only for browsing, never labelled confirmed open.
        if (activityMatch && !unverified) {
          const rejection = venueRejection(venue, prefs, intent);
          if (rejection) { reject(rejection, p, targeted); continue; }
        }
        if (lead && !matchesLead(venue, lead)) { reject("identity-mismatch", p, targeted); continue; }
        if (lead) venue = { ...attachRecommendationEvidence([venue], [lead])[0], visitMode: lead.visitMode || 'unknown' };
        if (targeted) targetedVenues.add(venue);
        candidates.push(venue);
      }
      if (lead && new Set(candidates.map(v => v.address)).size > 1) {
        candidates.forEach(v => reject("ambiguous-identity", v, targeted)); return [];
      }
      return candidates;
    }));
    const merged = new Map();
    for (const result of settled) {
      if (result.status === "rejected") { debug.failedQueries++; continue; }
      for (const venue of result.value) {
        const existing = merged.get(venue.id);
        if (existing) {
          reject("duplicate", venue, targetedVenues.has(venue));
          existing.tags = [...new Set([...existing.tags, ...venue.tags])];
          // Prefer sourced pricing over query-dependent fallback allowances.
          const confidence = v => v.priceLevel && v.priceLevel !== 'PRICE_LEVEL_UNSPECIFIED' ? 2 : v.priceEvidence ? 1 : 0;
          if (pricingConflicts.has(existing)) {
            existing.cost = Math.max(existing.cost, venue.cost);
          } else if (confidence(venue) > confidence(existing)) {
            for (const field of ['cost', 'priceStatus', 'priceLevel', 'priceEvidence', 'note']) {
              if (venue[field] === undefined) delete existing[field];
              else existing[field] = venue[field];
            }
          } else if (confidence(venue) === confidence(existing)) {
            existing.cost = Math.max(existing.cost, venue.cost);
            if (existing.priceStatus === 'free' && venue.priceStatus !== 'free' || venue.priceStatus === 'free' && existing.priceStatus !== 'free') {
              pricingConflicts.add(existing);
              existing.priceStatus = 'unknown'; existing.priceLevel = null; delete existing.priceEvidence;
              existing.note = 'Admission price unconfirmed: provider results disagree. This amount is a planning allowance; check with the venue.';
            }
          }
          existing.costLabel = venuePriceLabel(existing);
          if (venue.roles) existing.roles = [...new Set([...(existing.roles || []), ...venue.roles])];
        } else merged.set(venue.id, venue);
      }
    }
    if (settled.length && debug.failedQueries === settled.length) throw new Error("Google provider unavailable");
    const venues = [...merged.values()];
    debug.googleCandidates = venues.length;
    debug.unverifiedSuggestions = venues.filter(v => v.hoursStatus === "unverified").length;
    return { venues, debug };
  }
  async function discover(prefs, leads = null) { return (await discoverResults(prefs, leads)).venues; }
  async function discoverWithDebug(prefs) { return discoverResults(prefs); }

  async function routeMatrix(venues, prefs) {
    const point = (venue) => ({
      waypoint: {
        location: { latLng: { latitude: venue.lat, longitude: venue.lng } },
      },
    });
    const travelMode =
      prefs.transport === "Walking"
        ? "WALK"
        : prefs.transport === "Driving"
          ? "DRIVE"
          : "TRANSIT";
    const size = venues.length,
      rowLimit = travelMode === "TRANSIT" ? Math.floor(100 / size) : size;
    const matrix = venues.map((_, i) =>
      venues.map((_, j) => ({
        minutes: i === j ? 0 : null,
        distance: 0,
        source: "google",
      })),
    );
    const batches = [];
    for (let offset = 0; offset < size; offset += rowLimit)
      batches.push(offset);
    const departureTime =
      travelMode === "TRANSIT"
        ? outingInstant(prefs.date, prefs.time)
        : undefined;
    await Promise.all(
      batches.map(async (offset) => {
        const rows = await google(
          "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
          {
            origins: venues.slice(offset, offset + rowLimit).map(point),
            destinations: venues.map(point),
            travelMode,
            ...(departureTime ? { departureTime } : {}),
          },
          "originIndex,destinationIndex,duration,distanceMeters,status,condition",
        );
        for (const row of rows) {
          const i = offset + (row.originIndex || 0),
            j = row.destinationIndex || 0;
          if (
            row.condition === "ROUTE_EXISTS" &&
            !row.status?.code &&
            matrix[i]?.[j]
          ) {
            const duration = Math.ceil(parseFloat(row.duration) / 60);
            if (Number.isFinite(duration) && duration >= 0)
              matrix[i][j] = {
                minutes: duration,
                distance: (row.distanceMeters || 0) / 1000,
                source: "google",
              };
          }
        }
      }),
    );
    return matrix;
  }

  async function photo(name) {
    const response = await fetcher(
      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&skipHttpRedirect=true`,
      {
        headers: { "X-Goog-Api-Key": key },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Photo unavailable");
    const { photoUri } = await response.json();
    const image = await fetcher(photoUri, {
      signal: AbortSignal.timeout(10000),
    });
    if (!image.ok) throw new Error("Photo unavailable");
    return {
      type: image.headers.get("content-type") || "image/jpeg",
      body: Buffer.from(await image.arrayBuffer()),
    };
  }
  async function searchLocations(input, sessionToken) {
    const data = await google(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        input,
        sessionToken,
        languageCode: "en",
        regionCode: "au",
        includedRegionCodes: ["au"],
        locationRestriction: {
          rectangle: {
            low: { latitude: sydneyBounds.south, longitude: sydneyBounds.west },
            high: {
              latitude: sydneyBounds.north,
              longitude: sydneyBounds.east,
            },
          },
        },
      },
      "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
    );
    return (data.suggestions || []).flatMap(({ placePrediction: p }) =>
      p?.placeId
        ? [
            {
              id: p.placeId,
              name: p.structuredFormat?.mainText?.text || p.text?.text || "",
              address: p.structuredFormat?.secondaryText?.text || "",
              source: "google",
            },
          ]
        : [],
    );
  }
  async function resolveLocation(placeId, sessionToken) {
    const url = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    );
    url.searchParams.set("sessionToken", sessionToken);
    url.searchParams.set("languageCode", "en");
    url.searchParams.set("regionCode", "au");
    const response = await fetcher(url.toString(), {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Location unavailable");
    const p = await response.json();
    const coords = { lat: p.location?.latitude, lng: p.location?.longitude };
    if (!inSydney(coords)) throw new Error("Choose a location near Sydney");
    return {
      id: p.id,
      name: p.displayName?.text || p.formattedAddress,
      address: p.formattedAddress || "",
      ...coords,
      r: 3,
      source: "google",
    };
  }
  const researchCache = new Map(), researchPending = new Map();
  async function resolveResearch(prefs, leads) {
    const id = JSON.stringify([planningArea(prefs), leads]);
    const cached = researchCache.get(id);
    if (cached?.expires > Date.now()) return cached.value;
    if (researchPending.has(id)) return researchPending.get(id);
    const work = discover(prefs, leads).then(value => {
      if (researchCache.size >= 100) researchCache.delete(researchCache.keys().next().value);
      researchCache.set(id, { value, expires: Date.now() + 30 * 60000 }); return value;
    }).finally(() => researchPending.delete(id));
    researchPending.set(id, work); return work;
  }
  return { discover, discoverWithDebug, resolveResearch, routeMatrix, photo, searchLocations, resolveLocation };
}
