import { areas, categories } from "../src/data/preferences.js";
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
  return /food|Dinner|Brunch|Italian|Asian/i.test(tag)
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

  async function discover(prefs) {
    const area = areas[prefs.area];
    const lists = await Promise.all(
      discoveryQueries(prefs.preferences).map(async (tag) => {
        const data = await google(
          "https://places.googleapis.com/v1/places:searchText",
          {
            textQuery: `${tag} in ${prefs.area}, Sydney Australia`,
            pageSize: 6,
            locationBias: {
              circle: {
                center: { latitude: area.lat, longitude: area.lng },
                radius: Math.min(30000, area.r * 1000),
              },
            },
          },
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours,places.photos,places.googleMapsUri,places.businessStatus",
        );
        return (data.places || [])
          .filter(
            (p) =>
              p.businessStatus === "OPERATIONAL" &&
              p.regularOpeningHours?.periods &&
              p.location,
          )
          .map((p) => ({
            id: p.id,
            name: p.displayName.text,
            address: p.formattedAddress,
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
            tags: [tag],
            category: tag,
            weeklyHours: openingHours(p.regularOpeningHours.periods),
            source: "google",
            cost: allowance(tag),
            mins: 45,
            note: "Discovered with Google Places. Estimated spend is a planning allowance, not a venue quote. Check the venue before visiting.",
            mapsUri: p.googleMapsUri,
          }));
      }),
    );
    const merged = new Map();
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
  return { discover, routeMatrix, photo };
}
