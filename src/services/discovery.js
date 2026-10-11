import { scoreVenue } from '../engine/scoring.js';
import { withScheduleDefaults } from '../utils/date.js';
import { attachRecommendationEvidence, eventServiceOnly } from '../engine/recommendationEvidence.js';
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
import { selectCandidates, venueRejection } from "../engine/filtering.js";
import { mergeDiscoveryPool, sameBusiness } from "../engine/discoveryPool.ts";
import { optimiseExperience } from "../engine/generation.js";
import { closestExperience } from "../engine/alternatives.js";
import {
  selectVenues,
  demoMatrix,
  validPreferences,
} from "../utils/planner.js";

// Native Capacitor builds point to an HTTPS backend instead of the web dev proxy.
const apiBase = (import.meta.env?.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const apiUrl = (endpoint) => `${apiBase}/api/${endpoint}`;
const withApiPhoto = (venue) => ({
  ...venue,
  image: venue.image?.startsWith("/api/") ? apiBase + venue.image : venue.image,
});

async function api(path, body, signal) {
  const timeout = path === "discovery" ? 40000 : 20000;
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout),
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
    : attachRecommendationEvidence(curatedVenuesForDate(plan.prefs.date));
const noticeForVenues = (pool) => {
  const notices = [];
  if (pool.some((v) => v.source === "curated")) notices.push(curatedNotice);
  if (pool.some((v) => v.source === "google")) notices.push(liveNotice);
  return notices.join(" ") || demoNotice;
};
const noticeForPlan = (plan) =>
  plan.pickId && plan.pickNotice
    ? plan.pickNotice
    : noticeForVenues(plan.stops);
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

async function supplementCatalog(curated, prefs, signal, status) {
  if (!status) {
    try { status = await apiStatus(signal); } catch { checkCancelled(signal); status = {}; }
  }
  const initial = attachRecommendationEvidence(curated);
  const tasks = [];
  if (status.venues === 'google') tasks.push({ kind: 'venues', request: api('venues', { prefs }, signal) });
  // Independent research also improves a curated route; no Google key required.
  if (status.venues === 'google' || status.recommendations === 'openai') tasks.push({ kind: 'research', request: api('discovery', { prefs }, signal) });
  const results = await Promise.allSettled(tasks.map(task => task.request));
  checkCancelled(signal);
  let all = initial, live = false, researchStatus = 'sources';
  const leads = [];
  for (const [index, result] of results.entries()) {
    if (result.status !== 'fulfilled') {
      if (tasks[index].kind === 'research') researchStatus = 'unavailable';
      continue;
    }
    const found = result.value;
    const discovered = Array.isArray(found.venues) ? found.venues.filter(usableDiscoveredVenue).map(withApiPhoto) : [];
    all = mergeDiscoveryPool(all, discovered);
    live ||= discovered.length > 0;
    if (Array.isArray(found.leads)) leads.push(...found.leads);
    if (found.researchStatus) researchStatus = found.researchStatus;
    // Carry exact-branch evidence even when a duplicate keeps curated facts.
    for (const venue of discovered) if (venue.recommendationEvidence?.length)
      leads.push({ name: venue.name, locality: venue.address.match(/,\s*([^,]+?)\s+NSW/)?.[1] || venue.area, evidence: venue.recommendationEvidence });
  }
  all = attachRecommendationEvidence(all, leads);
  return { all, live, researchStatus,
    notice: (live ? ' ' + liveNotice : status.venues === 'google' ? ' Discovery unavailable; using sourced Sydney venues.' : '') +
      (researchStatus === 'unavailable' ? ' Web research unavailable; using linked source recommendations.' : '') };
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
  let all = attachRecommendationEvidence(curatedVenuesForDate(prefs.date)),
    notice = curatedNotice,
    aiEnabled = false, discoverySource = "sources";
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
    if (status.venues === "google" || aiEnabled) {
      await stage("checking local guides & community recommendations…", onStage, signal);
      const found = await supplementCatalog(
        all,
        { ...prefs, preferences: intent.interests },
        signal,
        status,
      );
      all = found.all;
      live = found.live;
      discoverySource = found.researchStatus;
      notice += found.notice;
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
  let candidates = ranked.candidates;
  notice += ranked.notice;
  await stage("checking budget, hours & distance…", onStage, signal);
  let { matrix, routeNotice } = await routeMatrix(
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
  if (!plan && previous)
    plan = optimiseExperience(candidates, prefs, matrix, intent);
  let recommendationSource = ranked.source;
  if (!plan) {
    await stage("finding the closest available alternatives…", onStage, signal);
    candidates = selectCandidates(
      all,
      prefs,
      { ...intent, allowAlternatives: true },
      {
        rejectedIds: previous?.rejectedIds || [],
        seed,
      },
    );
    const routing = await routeMatrix(candidates, prefs, live, signal);
    matrix = routing.matrix;
    if (routing.routeNotice && !notice.includes(routing.routeNotice))
      notice += routing.routeNotice;
    plan = closestExperience(candidates, prefs, matrix, intent, {
      excludeSignature: signature(previous),
    });
    if (!plan && previous)
      plan = closestExperience(candidates, prefs, matrix, intent);
    recommendationSource = "planner";
  }
  const unchanged =
    !!plan && !!previous && signature(plan) === signature(previous);
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
          recommendationSource,
          discoverySource,
        }
      : null,
    candidates,
    matrix,
    notice,
    unchanged: unchanged && !!plan && signature(plan) === signature(previous),
    failure: plan
      ? null
      : {
          message:
            "No sourced, open places nearby fit this time and budget. Try another time or area.",
        },
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
  const found = plan.stops.every(v => v.source === "demo")
    ? { all: catalogForPlan(plan), notice: "", live: false }
    : await supplementCatalog(catalogForPlan(plan), plan.prefs, signal);
  const all = found.all;
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
  const candidates = [
    ...plan.stops.map((v) => ({
      ...v,
      score: options.find((c) => c.id === v.id)?.score || 0,
    })),
    ...options
      .filter((v) => !plan.stops.some((s) => sameBusiness(s, v)))
      .slice(0, 14 - plan.stops.length),
  ];
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    plan.prefs,
    live || Boolean(found.live),
    signal,
  );
  return {
    candidates,
    matrix,
    notice: noticeForPlan({ ...plan, stops: candidates }) +
      found.notice + routeNotice + ranked.notice,
  };
}

// Extras are opt-in and use sourced venues; never manufacture a photobooth.
export async function prepareAdditions(plan, existing = [], { signal } = {}) {
  const live = plan.stops.some((v) => v.source === "google");
  const interests = ["Photo booths", "Desserts", "Scenic walks", "Bookshops"];
  const prefs = { ...plan.prefs, preferences: interests };
  const legacyDemo = plan.stops.every((v) => v.source === "demo");
  const found = legacyDemo
    ? { all: catalogForPlan(plan), notice: "", live: false }
    : await supplementCatalog(catalogForPlan(plan), prefs, signal);
  const all = found.all;
  const intent = plan.intent || interpretPreferences(plan.prefs);
  checkCancelled(signal);
  const extras = legacyDemo
    ? selectVenues(all, prefs)
    : selectCandidates(
        all,
        plan.prefs,
        { ...intent, interests: [...new Set([...intent.interests, ...interests])], requiredRoles: [], requiredTags: [], upscaleMeal: false, hiddenBars: false },
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
    if (!legacyDemo && !plan.stops.some(stop => stop.id === venue.id) &&
      venueRejection(venue, plan.prefs, { ...intent, allowAlternatives: true })) continue;
    if (!candidates.some((v) => sameBusiness(v, venue)))
      candidates.push(venue);
  }
  const ranked = await recommend(
    candidates,
    prefs,
    signal,
    undefined,
    plan.stops.map((v) => v.id),
    { ...intent, interests: [...new Set([...intent.interests, ...interests])], requiredRoles: [], requiredTags: [] },
  );
  candidates = ranked.candidates;
  const { matrix, routeNotice } = await routeMatrix(
    candidates,
    plan.prefs,
    live || Boolean(found.live),
    signal,
  );
  return {
    candidates,
    matrix,
    notice: noticeForPlan({ ...plan, stops: candidates }) +
      found.notice + routeNotice + ranked.notice,
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

export async function prepareBrowse(prefs, { signal } = {}) {
  const intent = interpretPreferences(prefs);
  const resolved = withScheduleDefaults(resolvePlanningTime(prefs, intent).prefs);
  const found = await supplementCatalog(curatedVenuesForDate(resolved.date), resolved, signal);
  checkCancelled(signal);
  // Browse preserves the full catalogue across areas. Rank nearby fits first;
  // enforce schedule/budget when the user actually builds or adds to a route.
  const candidates = found.all.filter(venue => !eventServiceOnly(venue))
    .map(venue => scoreVenue(venue, resolved, intent))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { candidates, notice: found.notice };
}
