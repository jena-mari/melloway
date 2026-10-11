import { categories } from "../src/data/preferences.js";
import { inSydney, planningArea, sydneyBounds } from "../src/utils/location.js";
import { attachRecommendationEvidence, matchesLead, eventServiceOnly } from '../src/engine/recommendationEvidence.js';
import { outingInstant } from "../src/utils/date.js";

export function openingHours(periods) {
  const days = Array.from({ length: 7 }, () => []);
  for (const period of periods || []) {
    const { open, close } = period;
    if (!open || !Number.isInteger(open.day) || open.day < 0 || open.day > 6)
      continue;
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

export function createGoogleProvider(key, fetcher = fetch) {
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

  async function discover(prefs, leads = null) {
    const area = planningArea(prefs);
    const settled = await Promise.allSettled(
      (leads ? leads.slice(0, 6).filter(lead => lead.tags?.length).map(lead => ({ tag: lead.tags[0], lead })) : discoveryQueries(prefs.preferences).map(tag => ({ tag }))).map(async ({ tag, lead }) => {
        const data = await google(
          "https://places.googleapis.com/v1/places:searchText",
          {
            textQuery: lead ? `${lead.name}, ${lead.locality}, Sydney Australia` : `${tag === 'Photo booths' ? 'walk-in self-service photobooth studio' : tag} near ${prefs.area}, Sydney Australia`,
            pageSize: lead ? 2 : 6,
            locationBias: {
              circle: {
                center: { latitude: area.lat, longitude: area.lng },
                radius: Math.min(30000, area.r * 1000),
              },
            },
          },
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours,places.photos,places.googleMapsUri,places.businessStatus,places.websiteUri,places.types,places.pureServiceAreaBusiness",
        );
        const candidates = (data.places || [])
          .filter(
            (p) =>
              p.businessStatus === "OPERATIONAL" &&
              p.regularOpeningHours?.periods &&
              p.location && inSydney({ lat: p.location.latitude, lng: p.location.longitude }),
          )
          .map((p) => ({
            id: p.id,
            name: p.displayName.text,
            address: p.formattedAddress,
            website: p.websiteUri,
            providerTypes: p.types,
            pureServiceAreaBusiness: p.pureServiceAreaBusiness,
            area: prefs.area,
            lat: p.location.latitude,
            lng: p.location.longitude,
            rating: p.rating,
            image: p.photos?.[0]
              ? "/api/photo?name=" + encodeURIComponent(p.photos[0].name)
              : undefined,
            attribution: p.photos?.[0]?.authorAttributions
              ?.map((a) => a.displayName)
              .join(", "),
            tags: lead ? lead.tags : [tag],
            category: tag,
            weeklyHours: openingHours(p.regularOpeningHours.periods),
            source: "google",
            cost: allowance(tag),
            mins:
              tag === "Fine dining"
                ? 120
                : ["Speakeasies", "Cocktail bars"].includes(tag)
                  ? 60
                  : tag === "Photo booths"
                    ? 15
                    : 45,
            note: "Discovered with Google Places. Estimated spend is a planning allowance, not a venue quote. Check the venue before visiting.",
            mapsUri: p.googleMapsUri,
          }))
          .filter(v => !eventServiceOnly(v) && (!lead || matchesLead(v, lead)))
          .map(v => lead ? { ...attachRecommendationEvidence([v], [lead])[0], visitMode: lead.visitMode || 'unknown' } : v);
        // A name/suburb pair that resolves to multiple addresses is ambiguous.
        // Never choose the first Google hit and attribute a different branch's post.
        if (lead && new Set(candidates.map(v => v.address)).size > 1) return [];
        return candidates;
      }),
    );
    const merged = new Map();
    const lists = settled.filter(result => result.status === "fulfilled").map(result => result.value);
    if (settled.length && !lists.length) throw new Error("Google provider unavailable");
    for (const venue of lists.flat()) {
      const existing = merged.get(venue.id);
      if (existing) {
        existing.tags = [...new Set([...existing.tags, ...venue.tags])];
        existing.cost = Math.max(existing.cost, venue.cost);
      } else merged.set(venue.id, venue);
    }
    return [...merged.values()];
  }

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
  return { discover, resolveResearch, routeMatrix, photo, searchLocations, resolveLocation };
}
