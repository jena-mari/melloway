import { venues } from "../data/venues.js";
import { localLocations } from "../utils/location.js";
import { createId } from "../utils/id.js";
import { applyRecommendations } from "../utils/recommendations.js";
import { curatedVenuesForDate } from "../data/sydneyVenues.js";
import {
  interpretPreferences,
  mergeIntent,
  resolvePlanningTime,
} from "../engine/preferences.js";
import { selectCandidates } from "../engine/filtering.js";
import { optimiseExperience, explainNoMatch } from "../engine/generation.js";
import {
  selectVenues,
  demoMatrix,
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
const curatedNotice =
  "Real Sydney venues from linked sources. Published hours checked 11 Oct 2026; costs, visit lengths and map positions are estimates. Confirm bookings and changes.";
const catalogForPlan = (plan) =>
  plan.stops.every((v) => v.source === "demo")
    ? venues
    : curatedVenuesForDate(plan.prefs.date);
const noticeForPlan = (plan) =>
  plan.stops.some((v) => v.source === "google")
    ? liveNotice
    : plan.stops.some((v) => v.source === "curated")
      ? curatedNotice
      : demoNotice;
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
      const { matrix } = await api(
        "matrix",
        { venues: candidates, prefs },
        signal,
      );
      if (
        !Array.isArray(matrix) ||
        matrix.length !== candidates.length ||
        matrix.some(
          (row) => !Array.isArray(row) || row.length !== candidates.length,
        )
      )
        throw new Error("Incomplete routing response");
      return { matrix, routeNotice: "" };
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

function usableDiscoveredVenue(v) {
  return (
    v &&
    v.source === "google" &&
    [v.id, v.name, v.address, v.category, v.area].every(
      (s) => typeof s === "string" && s.length > 0,
    ) &&
    Array.isArray(v.tags) &&
    v.tags.every((t) => typeof t === "string") &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng) &&
    Number.isFinite(v.cost) &&
    v.cost >= 0 &&
    Number.isFinite(v.mins) &&
    v.mins > 0 &&
    Array.isArray(v.weeklyHours) &&
    v.weeklyHours.length === 7 &&
    v.weeklyHours.every(
      (day) =>
        Array.isArray(day) &&
        day.every(
          (w) =>
            Number.isFinite(w.open) &&
            Number.isFinite(w.close) &&
            w.close > w.open,
        ),
    )
  );
}

async function apiStatus(signal) {
  const response = await fetch(apiUrl("status"), {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("API unavailable");
  return response.json();
}

async function recommend(
  candidates,
  prefs,
  signal,
  enabled,
  keepIds = [],
  intent,
) {
  try {
    if (enabled === undefined)
      enabled = (await apiStatus(signal)).recommendations === "openai";
    if (enabled && candidates.length) {
      const { rankings } = await api(
        "recommendations",
        { prefs: { ...prefs, intent }, venues: candidates },
        signal,
      );
      return {
        candidates: applyRecommendations(candidates, rankings, keepIds),
        source: "openai",
        notice: "",
      };
    }
  } catch {
    checkCancelled(signal);
    return {
      candidates,
      source: "planner",
      notice: enabled ? " AI unavailable; using preference matches." : "",
    };
  }
  return { candidates, source: "planner", notice: "" };
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
  let all = curatedVenuesForDate(prefs.date),
    notice = curatedNotice,
    aiEnabled = false;
  let intent = interpretPreferences(prefs);
  let live = false;
  try {
    const status = await apiStatus(signal);
    aiEnabled = status.recommendations === "openai";
    if (aiEnabled) {
      await stage("understanding ur plans…", onStage, signal);
      try {
        intent = mergeIntent(
          intent,
          (await api("intent", { prefs }, signal)).intent,
        );
      } catch {
        checkCancelled(signal);
        notice +=
          " AI interpretation unavailable; using your selected interests and notes.";
      }
    }
    const resolved = resolvePlanningTime(prefs, intent);
    prefs = resolved.prefs;
    notice += resolved.notice;
    if (status.venues === "google") {
      const found = await api(
        "venues",
        { prefs: { ...prefs, preferences: intent.interests } },
        signal,
      );
      if (
        Array.isArray(found.venues) &&
        found.venues.length >= 2 &&
        found.venues.every(usableDiscoveredVenue)
      ) {
        all = found.venues.map(withApiPhoto);
        live = true;
        notice = liveNotice + resolved.notice;
      } else notice += " Discovery unavailable; using sourced Sydney venues.";
    }
  } catch {
    checkCancelled(signal);
  }
  // Time inference also works when no backend is running.
  const resolved = resolvePlanningTime(prefs, intent);
  prefs = resolved.prefs;
  if (!notice.includes("inferred from your notes")) notice += resolved.notice;
  if (aiEnabled)
    await stage("matching spots to ur preferences…", onStage, signal);
  const ranked = await recommend(
    selectCandidates(all, prefs, intent, {
      rejectedIds: previous?.rejectedIds || [],
      seed,
    }),
    prefs,
    signal,
    aiEnabled,
    [],
    intent,
  );
  const candidates = ranked.candidates;
  notice += ranked.notice;
  await stage("checking budget, hours & distance…", onStage, signal);
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    prefs,
    live,
    signal,
  );
  notice += routeNotice;
  await stage("exploring the best order for ur stops…", onStage, signal);
  let plan = optimiseExperience(candidates, prefs, matrix, intent, {
    excludeSignature: signature(previous),
  });
  // Revalidate an unchanged route against today's pool and constraints. Never
  // carry a cached demo route into new generation.
  const unchanged = !plan && !!previous;
  if (unchanged) plan = optimiseExperience(candidates, prefs, matrix, intent);
  if (plan) {
    const omitted = intent.interests.filter(
      (t) =>
        !intent.requiredTags.includes(t) &&
        !plan.stops.some((v) => v.tags.includes(t)),
    );
    if (omitted.length)
      notice += ` Suggested activities that couldn't fit: ${omitted.join(", ")}.`;
  }
  return {
    plan: plan
      ? {
          ...plan,
          id:
            unchanged && signature(plan) === signature(previous)
              ? previous.id
              : createId(),
          prefs,
          notice,
          createdAt: new Date().toISOString(),
          rejectedIds: previous?.rejectedIds || [],
          recommendationSource: ranked.source,
        }
      : null,
    candidates,
    matrix,
    notice,
    unchanged: unchanged && !!plan && signature(plan) === signature(previous),
    failure: plan
      ? null
      : { message: explainNoMatch(all, prefs, intent, candidates) },
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
    notice: noticeForPlan(plan) + routeNotice,
  };
}

export async function prepareReplacement(plan, { signal } = {}) {
  const live = plan.stops.some((v) => v.source === "google");
  const all = live
    ? (await api("venues", { prefs: plan.prefs }, signal)).venues.map(
        withApiPhoto,
      )
    : catalogForPlan(plan);
  const intent = plan.intent || interpretPreferences(plan.prefs);
  const selected = plan.stops.every((v) => v.source === "demo")
    ? selectVenues(all, plan.prefs)
    : selectCandidates(all, plan.prefs, intent, {
        rejectedIds: plan.rejectedIds || [],
      });
  const ranked = await recommend(
    selected,
    plan.prefs,
    signal,
    undefined,
    plan.stops.map((v) => v.id),
    intent,
  );
  const options = ranked.candidates;
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
    notice: noticeForPlan(plan) + routeNotice + ranked.notice,
  };
}

// Extras are opt-in and use sourced venues; never manufacture a photobooth.
export async function prepareAdditions(plan, existing = [], { signal } = {}) {
  const live = plan.stops.some((v) => v.source === "google");
  const interests = ["Photo booths", "Desserts", "Scenic walks", "Bookshops"];
  const prefs = { ...plan.prefs, preferences: interests };
  const legacyDemo = plan.stops.every((v) => v.source === "demo");
  const all = live
    ? (await api("venues", { prefs }, signal)).venues.map(withApiPhoto)
    : catalogForPlan(plan);
  const intent = plan.intent || interpretPreferences(plan.prefs);
  checkCancelled(signal);
  const extras = legacyDemo
    ? selectVenues(all, prefs)
    : selectCandidates(
        all,
        plan.prefs,
        { ...intent, requiredRoles: [] },
        { rejectedIds: plan.rejectedIds || [] },
      );
  // Give each extra type a chance, rather than filling the pool with cafés.
  const firstOfEach = interests
    .map((tag) =>
      selectVenues(extras, { ...prefs, preferences: [tag] }).find((v) =>
        v.tags.includes(tag),
      ),
    )
    .filter(Boolean);
  let candidates = [];
  for (const venue of [...plan.stops, ...firstOfEach, ...existing, ...extras]) {
    if (candidates.length === 14) break;
    if (
      !plan.stops.some((s) => s.id === venue.id) &&
      plan.rejectedIds?.includes(venue.id)
    )
      continue;
    if (!candidates.some((v) => v.id === venue.id || v.name === venue.name))
      candidates.push(venue);
  }
  const ranked = await recommend(
    candidates,
    plan.prefs,
    signal,
    undefined,
    plan.stops.map((v) => v.id),
    intent,
  );
  candidates = ranked.candidates;
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    plan.prefs,
    live,
    signal,
  );
  return {
    candidates,
    matrix,
    notice: noticeForPlan(plan) + routeNotice + ranked.notice,
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
