import { venues } from "../data/venues.js";
import { localLocations, planningArea } from "../utils/location.js";
import { createId } from "../utils/id.js";
import {
  selectVenues,
  demoMatrix,
  optimise,
  validPreferences,
} from "../utils/planner.js";

// Native Capacitor builds point to an HTTPS backend instead of the web dev proxy.
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const apiUrl = (endpoint) => `${apiBase}/api/${endpoint}`;
const withApiPhoto = (venue) => ({
  ...venue,
  image: venue.image?.startsWith("/api/") ? apiBase + venue.image : venue.image,
});

async function api(path, body, signal) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Provider unavailable");
  return response.json();
}
const demoNotice =
  "Demo venues, sample hours and estimated prices. Mood photos are illustrative.";
const liveNotice =
  "Google Places data. Costs and visit durations are planning allowances; confirm availability before booking.";
const signature = (plan) =>
  plan?.stops
    .map((v) => v.id)
    .sort()
    .join("|");
function checkCancelled(signal) {
  signal?.throwIfAborted();
}
async function stage(message, onStage, signal) {
  checkCancelled(signal);
  onStage(message);
  // Yield a browser task so actual processing progress can paint before DFS work.
  await new Promise((resolve) => setTimeout(resolve, 0));
  checkCancelled(signal);
}
async function routeMatrix(candidates, prefs, live, signal) {
  if (live) {
    try {
      return {
        matrix: (await api("matrix", { venues: candidates, prefs }, signal))
          .matrix,
        routeNotice: "",
      };
    } catch {
      checkCancelled(signal);
      return {
        matrix: demoMatrix(candidates, prefs.transport),
        routeNotice:
          " Routing unavailable: travel uses rough geographic estimates.",
      };
    }
  }
  return { matrix: demoMatrix(candidates, prefs.transport), routeNotice: "" };
}

export async function generate(
  prefs,
  seed = 0,
  onStage = () => {},
  previous = null,
  { signal } = {},
) {
  if (!validPreferences(prefs))
    throw new Error("Please check your planning details.");
  await stage("finding spots that fit ur vibe…", onStage, signal);
  let all = venues,
    notice = demoNotice;
  try {
    const response = await fetch(apiUrl("status"), {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
    if (response.ok && (await response.json()).venues === "google") {
      const live = await api("venues", { prefs }, signal);
      if (Array.isArray(live.venues) && live.venues.length >= 3) {
        all = live.venues.map(withApiPhoto);
        notice = liveNotice;
      }
    }
  } catch {
    checkCancelled(signal);
  }
  const candidates = selectVenues(all, prefs, seed);
  await stage("checking budget, hours & distance…", onStage, signal);
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    prefs,
    all !== venues,
    signal,
  );
  notice += routeNotice;
  await stage("exploring the best order for ur stops…", onStage, signal);
  let plan = optimise(candidates, prefs, matrix, {
    excludeSignature: signature(previous),
  });
  const unchanged = !plan && !!previous;
  if (unchanged) plan = previous;
  return {
    plan: plan
      ? {
          ...plan,
          id: unchanged ? previous.id : createId(),
          prefs,
          notice,
          createdAt: new Date().toISOString(),
        }
      : null,
    candidates,
    matrix,
    notice,
    unchanged,
  };
}

// Rebuild only the replacement pool for a saved plan. Keep its chosen stops.
export async function prepareRouteEdit(plan, { signal } = {}) {
  const candidates = plan.stops;
  const live = candidates.some((v) => v.source === "google");
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    plan.prefs,
    live,
    signal,
  );
  return {
    candidates,
    matrix,
    notice: (live ? liveNotice : demoNotice) + routeNotice,
  };
}

export async function prepareReplacement(plan, { signal } = {}) {
  const live = plan.stops.some((v) => v.source === "google");
  const all = live
    ? (await api("venues", { prefs: plan.prefs }, signal)).venues.map(
        withApiPhoto,
      )
    : venues;
  const options = selectVenues(all, plan.prefs);
  const currentIds = new Set(plan.stops.map((v) => v.id));
  const candidates = [
    ...plan.stops.map((v) => ({
      ...v,
      score: options.find((c) => c.id === v.id)?.score || 0,
    })),
    ...options
      .filter((v) => !currentIds.has(v.id))
      .slice(0, 14 - plan.stops.length),
  ];
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    plan.prefs,
    live,
    signal,
  );
  return {
    candidates,
    matrix,
    notice: (live ? liveNotice : demoNotice) + routeNotice,
  };
}

// Extras are opt-in. Demo photobooths never enter the generated main route.
export async function prepareAdditions(plan, existing = [], { signal } = {}) {
  const live = plan.stops.some((v) => v.source === "google");
  const interests = ["Photo booths", "Desserts", "Scenic walks", "Bookshops"];
  const prefs = { ...plan.prefs, preferences: interests };
  const area = planningArea(prefs);
  const sampleBooth = {
    id: `sample-photobooth-${area.lat}-${area.lng}`,
    name: "Sample photobooth",
    category: "Photo booths",
    tags: ["Photo booths", "Photo spots"],
    area: prefs.area,
    address: `${prefs.area}, Sydney · sample location`,
    lat: area.lat + 0.002,
    lng: area.lng + 0.002,
    cost: 12,
    mins: 15,
    hours: { open: 540, close: 1380 },
    source: "demo",
    note: "A sample 15-minute photobooth detour. This is a prototype location, not a verified business; find a real booth before heading out.",
  };
  const all = live
    ? (await api("venues", { prefs }, signal)).venues.map(withApiPhoto)
    : [...venues, sampleBooth];
  checkCancelled(signal);
  const extras = selectVenues(all, prefs);
  // Give each extra type a chance, rather than filling the pool with cafés.
  const firstOfEach = interests
    .map((tag) =>
      selectVenues(all, { ...prefs, preferences: [tag] }).find((v) =>
        v.tags.includes(tag),
      ),
    )
    .filter(Boolean);
  const candidates = [];
  for (const venue of [...plan.stops, ...firstOfEach, ...existing, ...extras]) {
    if (candidates.length === 14) break;
    if (!candidates.some((v) => v.id === venue.id || v.name === venue.name))
      candidates.push(venue);
  }
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    plan.prefs,
    live,
    signal,
  );
  return {
    candidates,
    matrix,
    notice: (live ? liveNotice : demoNotice) + routeNotice,
  };
}

export async function searchLocations(query, sessionToken, signal) {
  try {
    return await api("locations/search", { query, sessionToken }, signal);
  } catch {
    checkCancelled(signal);
    return { source: "local", suggestions: localLocations(query) };
  }
}
export async function resolveLocation(placeId, sessionToken, signal) {
  return (await api("locations/resolve", { placeId, sessionToken }, signal))
    .location;
}
