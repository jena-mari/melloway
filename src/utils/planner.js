import { areas, categories } from "../data/preferences.js";
import { validDate, validTime } from "./date.js";

const modes = ["Walking", "Public transport", "Driving"];
const interestOptions = new Set(Object.values(categories).flat());
export function validPreferences(prefs) {
  return Boolean(
    prefs &&
    Object.hasOwn(areas, prefs.area) &&
    modes.includes(prefs.transport) &&
    validDate(prefs.date) &&
    validTime(prefs.time) &&
    Number.isFinite(Number(prefs.budget)) &&
    Number(prefs.budget) >= 0 &&
    Number(prefs.budget) <= 200 &&
    [3, 4, 5, 6, 8].includes(Number(prefs.duration)) &&
    Array.isArray(prefs.preferences) &&
    prefs.preferences.every((tag) => interestOptions.has(tag)),
  );
}

export function km(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const x =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}
export const minutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export function formatTime(value) {
  const total = Math.round(value),
    clock = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(clock / 60),
    m = clock % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}${total >= 1440 ? " (+1 day)" : ""}`;
}
export const transportAllowance = (mode) =>
  mode === "Public transport" ? 10 : mode === "Driving" ? 15 : 0;

export function selectVenues(venues, prefs, seed = 0) {
  if (!validPreferences(prefs)) return [];
  const area = areas[prefs.area];
  return venues
    .filter(
      (v) =>
        Number.isFinite(v.lat) &&
        Number.isFinite(v.lng) &&
        km(v, area) <= area.r &&
        v.cost <= prefs.budget,
    )
    .map((v) => ({
      ...v,
      score:
        v.tags.filter((t) => prefs.preferences.includes(t)).length * 5 +
        ((v.id + seed)
          .split("")
          .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) %
          100) /
          100,
    }))
    .sort((a, b) => b.score - a.score || km(a, area) - km(b, area))
    .filter((v, i, list) => list.findIndex((x) => x.name === v.name) === i)
    .slice(0, 14);
}

export function demoMatrix(venues, mode) {
  return venues.map((a) =>
    venues.map((b) => ({
      minutes:
        a.id === b.id
          ? 0
          : Math.ceil(
              km(a, b) *
                (mode === "Walking"
                  ? 1.35 / 4.5
                  : mode === "Driving"
                    ? 1.5 / 22
                    : 1.5 / 18) *
                60,
            ) + (mode === "Public transport" ? 8 : mode === "Driving" ? 5 : 0),
      distance: km(a, b),
      source: "estimate",
    })),
  );
}

function openingWindow(venue, day, earliest) {
  // Close values may exceed 1440 for overnight hours. Also examine the next
  // day's hours because an outing of up to eight hours can cross midnight.
  const windows = [0, 1]
    .flatMap((offset) => {
      const hours = venue.weeklyHours
        ? venue.weeklyHours[(day + offset) % 7]
        : venue.hours
          ? [venue.hours]
          : [];
      return (hours || []).map((w) => ({
        open: w.open + offset * 1440,
        close: w.close + offset * 1440,
      }));
    })
    .sort((a, b) => a.open - b.open);
  return windows.find(
    (w) => Math.max(earliest, w.open) + venue.mins <= w.close,
  );
}

export function schedule(stops, prefs, matrix, indices) {
  if (!validPreferences(prefs)) return null;
  let time = minutes(prefs.time),
    cost = transportAllowance(prefs.transport),
    travel = 0;
  const end = time + Number(prefs.duration) * 60;
  const day = new Date(prefs.date + "T12:00:00Z").getUTCDay();
  const result = [];
  for (let i = 0; i < stops.length; i++) {
    const venue = stops[i],
      leg = i ? matrix[indices[i - 1]]?.[indices[i]] : null;
    if (i && (!leg || !Number.isFinite(leg.minutes) || leg.minutes < 0))
      return null;
    if (
      !Number.isFinite(venue.cost) ||
      venue.cost < 0 ||
      !Number.isFinite(venue.mins) ||
      venue.mins <= 0
    )
      return null;
    time += leg?.minutes || 0;
    travel += leg?.minutes || 0;
    cost += venue.cost;
    const window = openingWindow(venue, day, time);
    if (!window) return null;
    time = Math.max(time, window.open);
    if (time + venue.mins > end || cost > Number(prefs.budget)) return null;
    result.push({ ...venue, arrival: time, travelFromPrevious: leg });
    time += venue.mins;
  }
  return {
    stops: result,
    cost,
    transportAllowance: transportAllowance(prefs.transport),
    travel,
    elapsed: time - minutes(prefs.time),
    distance: result.reduce(
      (s, v) => s + (v.travelFromPrevious?.distance || 0),
      0,
    ),
    source: result
      .slice(1)
      .every((v) => v.travelFromPrevious.source === "google")
      ? "google"
      : "estimate",
  };
}

// Bounded DFS explores feasible graph paths. Travel edges come from a routing
// provider or labelled estimates. Budget/time violations prune branches.
export function optimise(candidates, prefs, matrix, { excludeSignature } = {}) {
  let best = null,
    bestScore = -Infinity,
    nodes = 0;
  function dfs(path, used) {
    if (++nodes > 120000) return;
    const plan = path.length
      ? schedule(
          path.map((i) => candidates[i]),
          prefs,
          matrix,
          path,
        )
      : null;
    if (path.length && !plan) return;
    if (path.length >= 3) {
      const signature = path
        .map((i) => candidates[i].id)
        .sort()
        .join("|");
      const unique = new Set(
        plan.stops.flatMap((v) =>
          v.tags.filter((t) => prefs.preferences.includes(t)),
        ),
      ).size;
      const repeated =
        plan.stops.length - new Set(plan.stops.map((v) => v.category)).size;
      const score =
        path.reduce((s, i) => s + candidates[i].score, 0) +
        unique * 4 +
        path.length * 4 -
        plan.travel * 0.18 -
        repeated * 9;
      if (signature !== excludeSignature && score > bestScore) {
        bestScore = score;
        best = plan;
      }
    }
    if (path.length === 5) return;
    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      dfs([...path, i], used);
      used.delete(i);
    }
  }
  dfs([], new Set());
  return best;
}

export function replaceStop(plan, index, candidates, prefs, matrix) {
  if (!Number.isInteger(index) || index < 0 || index >= plan.stops.length)
    return null;
  const ids = plan.stops.map((s) => s.id);
  let best = null,
    bestScore = -Infinity;
  for (const candidate of candidates) {
    if (
      ids.includes(candidate.id) ||
      plan.stops.some((s) => s.name === candidate.name)
    )
      continue;
    const stops = plan.stops.map((v, i) => (i === index ? candidate : v));
    const indices = stops.map((v) =>
      candidates.findIndex((c) => c.id === v.id),
    );
    if (indices.some((i) => i < 0)) continue;
    const next = schedule(stops, prefs, matrix, indices);
    if (next && candidate.score - next.travel * 0.15 > bestScore) {
      best = next;
      bestScore = candidate.score - next.travel * 0.15;
    }
  }
  return best;
}
export function directions(stops, mode) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${stops[0].lat},${stops[0].lng}`);
  url.searchParams.set(
    "destination",
    `${stops.at(-1).lat},${stops.at(-1).lng}`,
  );
  url.searchParams.set(
    "waypoints",
    stops
      .slice(1, -1)
      .map((s) => `${s.lat},${s.lng}`)
      .join("|"),
  );
  url.searchParams.set(
    "travelmode",
    mode === "Walking" ? "walking" : mode === "Driving" ? "driving" : "transit",
  );
  return url.href;
}
