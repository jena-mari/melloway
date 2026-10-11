import { validPreferences } from "../utils/planner";
import { withScheduleDefaults } from "../utils/date";
import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { defaultDraft } from "../data/preferences";
import { normalisePlanNames } from "../utils/venueNames";
import { cleanPlanTitle, MAX_PLAN_TITLE_LENGTH, mergeSavedPlans } from "../utils/planTitles.js";
import { readProfile } from "../utils/profile";
import {
  readLocal,
  writeLocal,
  saveCloud,
  loadCloud,
  deleteCloud,
} from "../services/storage";
import { validPlan, readJourney, finishJourney, archiveRoute, cleanReview, HISTORY_KEY } from "../utils/routeHistory";
import { sameBusiness } from '../engine/discoveryPool.ts';
const validPlace = place => place && typeof place.id === 'string' && typeof place.name === 'string' &&
  typeof place.address === 'string' && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Array.isArray(place.tags);
const Context = createContext(null);
function readDraft() {
  const stored = readLocal("melloway.draft", {});
  const draft = {
    ...defaultDraft(),
    ...(stored && typeof stored === "object" && !Array.isArray(stored)
      ? stored
      : {}),
  };
  return validPreferences(withScheduleDefaults(draft)) ? draft : defaultDraft();
}
function readSaved() {
  const stored = readLocal("melloway.saved", []);
  return Array.isArray(stored)
    ? stored.filter(validPlan).map(normalisePlanNames)
    : [];
}
export function AppProvider({ children }) {
  const [draft, setDraft] = useState(readDraft);
  const [profile, setProfile] = useState(() =>
    readProfile(readLocal("melloway.profile", null)),
  );
  const [saved, setSaved] = useState(readSaved);
  const [savedPlaces, setSavedPlaces] = useState(() => {
    const value = readLocal('melloway.savedPlaces', []);
    return Array.isArray(value) ? value.filter(validPlace).slice(0, 100) : [];
  });
  function togglePlaceSave(venue) {
    if (!validPlace(venue)) return false;
    const kept = savedPlaces.some(place => sameBusiness(place, venue));
    if (!kept && savedPlaces.length >= 100) { setStatus('Up to 100 saved places. Remove one to save another.'); return false; }
    const { arrival, arrivalOverride, visitOverride, travelFromPrevious, ...place } = venue;
    const next = kept ? savedPlaces.filter(place => !sameBusiness(place, venue)) : [place, ...savedPlaces];
    try { writeLocal('melloway.savedPlaces', next); setSavedPlaces(next); return true; }
    catch { return false; }
  }
  const [journey] = useState(() => readJourney(readLocal, writeLocal));
  const unpersistedHistory = useRef(Boolean(journey.unpersisted));
  const [history, setHistory] = useState(journey.history);
  const [current, storeCurrent] = useState(journey.current);
  const journeyRef = useRef({ current, history });
  journeyRef.current = { current, history };
  const [completionId, setCompletionId] = useState("");
  const [completionMode, setCompletionMode] = useState("choice");
  const [savedEvents, setSavedEvents] = useState(() => {
    const ids = readLocal("melloway.savedEvents", []);
    return Array.isArray(ids)
      ? [...new Set(ids.filter((id) => typeof id === "string"))]
      : [];
  });
  const [status, setStatus] = useState(journey.warning || "");
  useEffect(() => {
    try {
      writeLocal("melloway.draft", draft);
    } catch {
      setStatus(
        "Browser storage unavailable. Keep this tab open to retain your plan.",
      );
    }
  }, [draft]);
  useEffect(() => {
    loadCloud()
      .then((plans) => {
        plans = plans.filter(validPlan).map(normalisePlanNames);
        if (plans.length)
          setSaved((old) => mergeSavedPlans(old, plans));
      })
      .catch(() =>
        setStatus("Cloud sync unavailable. Local favourites are still here."),
      );
  }, []);
  useEffect(() => {
    try {
      writeLocal("melloway.saved", saved);
    } catch {
      setStatus("Favourites could not be stored. Browser storage may be full.");
    }
  }, [saved]);
  useEffect(() => {
    if (unpersistedHistory.current && !current) return;
    try {
      writeLocal("melloway.current", current);
    } catch {
      setStatus("Current plan could not be stored. Keep this tab open.");
    }
  }, [current]);
  const setCurrent = useCallback((next) => {
    const { current, history } = journeyRef.current;
    if (unpersistedHistory.current) {
      try { writeLocal(HISTORY_KEY, history); unpersistedHistory.current = false; }
      catch { setStatus("Free some device storage before starting a new plan. Your past date is still safe."); return false; }
    }
    const route = typeof next === "function" ? next(current) : next;
    if (!route) { journeyRef.current = { current: null, history }; storeCurrent(null); return true; }
    if (route.plan?.status === "completed" || history.some(r => r.id === route.plan?.id)) {
      setStatus("This date is in Past Dates. Redo it to start a new copy.");
      return false;
    }
    const active = { ...route, plan: { ...route.plan,
      status: route.plan.status === "in-progress" ? "in-progress" : "upcoming" } };
    if (current?.plan.id === active.plan.id && current.plan.status === 'in-progress') {
      active.plan.status = 'in-progress';
      active.plan.startedAt = current.plan.startedAt;
    }
    try { writeLocal("melloway.current", active); }
    catch { setStatus("Couldn’t store this plan. Device storage may be full."); return false; }
    journeyRef.current = { current: active, history };
    storeCurrent(active);
    return true;
  }, []);
  function startRoute() {
    if (!current) return false;
    return setCurrent({ ...current, plan: { ...current.plan, status: "in-progress",
      startedAt: current.plan.startedAt || new Date().toISOString() } });
  }
  function finishRoute() {
    if (!current) return false;
    try {
      const result = finishJourney(current, history, writeLocal);
      unpersistedHistory.current = false;
      setHistory(result.history);
      storeCurrent(null);
      setCompletionMode("choice");
      setCompletionId(result.entry.id);
      setStatus("");
      return true;
    } catch {
      setStatus("Couldn’t save your past date. Free some device storage and try again.");
      return false;
    }
  }
  function saveReview(id, values) {
    const entry = history.find(r => r.id === id);
    if (!entry) return false;
    const next = history.map(r => r.id === id ? { ...r, review: cleanReview(values, r.plan) } : r);
    try {
      writeLocal(HISTORY_KEY, next);
      unpersistedHistory.current = false;
      setHistory(next);
      setStatus("Review saved privately on this device.");
      return true;
    } catch {
      setStatus("Couldn’t save your review. Device storage may be full.");
      return false;
    }
  }
  function openSavedPlan(plan) {
    if (history.some(r => r.id === plan.id)) return `/history/${encodeURIComponent(plan.id)}`;
    // A completed cloud bookmark from another device can also be revisited,
    // without activating it or including any private review in the cloud plan.
    if (plan.status === 'completed') {
      try {
        const entry = archiveRoute({ plan }, plan.completedAt);
        const next = [entry, ...history];
        writeLocal(HISTORY_KEY, next);
        unpersistedHistory.current = false;
        setHistory(next);
        return `/history/${encodeURIComponent(plan.id)}`;
      } catch { setStatus('Couldn’t open this past date. Device storage may be full.'); return null; }
    }
    return setCurrent({ plan, candidates: [], matrix: [] }) ? '/itinerary' : null;
  }
  const savedPlans = saved.map(plan => history.find(r => r.id === plan.id)?.plan ||
    (current?.plan.id === plan.id ? current.plan : plan));
  function renameCurrentPlan(value, id) {
    const title = cleanPlanTitle(value);
    const { current, history } = journeyRef.current;
    if (!title || title.length > MAX_PLAN_TITLE_LENGTH || !current?.plan || current.plan.id !== id ||
      current.plan.status === 'completed' || history.some(entry => entry.id === id)) return false;
    const name = { title, titleUpdatedAt: new Date().toISOString() };
    const next = { ...current, plan: { ...current.plan, ...name } };
    const bookmark = saved.find(plan => plan.id === id);
    const nextSaved = saved.map(plan => plan.id === id ? { ...plan, ...name } : plan);
    let wroteSaved = false;
    try {
      if (bookmark) { writeLocal('melloway.saved', nextSaved); wroteSaved = true; }
      writeLocal('melloway.current', next);
    } catch {
      if (wroteSaved) {
        try { writeLocal('melloway.saved', saved); } catch { /* Keep the stored name recoverable. */ }
      }
      setStatus('Couldn’t rename this date. Device storage may be full.');
      return false;
    }
    journeyRef.current = { current: next, history };
    storeCurrent(next);
    setStatus('Name saved on this device.');
    if (bookmark) {
      setSaved(nextSaved);
      saveCloud({ ...bookmark, ...name }).catch(() =>
        setStatus('Name saved on this device. Cloud sync failed; try saving again later.'));
    }
    return true;
  }
  async function save(plan) {
    plan = history.find(r => r.id === plan.id)?.plan || plan;
    try {
      writeLocal(
        "melloway.saved",
        saved.some((p) => p.id === plan.id) ? saved.map(p => p.id === plan.id ? plan : p) : [plan, ...saved],
      );
      setSaved((old) =>
        old.some((p) => p.id === plan.id) ? old.map(p => p.id === plan.id ? plan : p) : [plan, ...old],
      );
      setStatus("Saved on this device.");
      try {
        if (await saveCloud(plan))
          setStatus("Saved on this device and synced to Supabase.");
      } catch {
        setStatus(
          "Saved on this device. Cloud sync failed; try saving again later.",
        );
      }
    } catch {
      setStatus("Unable to save: browser storage is unavailable or full.");
    }
  }
  async function remove(id) {
    try {
      await deleteCloud(id);
      setSaved((old) => old.filter((p) => p.id !== id));
      setStatus("Removed from favourites.");
    } catch {
      setStatus("Cloud deletion failed. Please retry when connected.");
    }
  }
  function startNew() {
    setDraft(defaultDraft());
    setCurrent(null);
    setStatus("");
  }
  function toggleEventSave(id) {
    const kept = savedEvents.includes(id);
    const next = kept
      ? savedEvents.filter((eventId) => eventId !== id)
      : [...savedEvents, id];
    try {
      writeLocal("melloway.savedEvents", next);
      setSavedEvents(next);
      setStatus(
        kept ? "Event removed from saved." : "Event saved on this device.",
      );
    } catch {
      setStatus("Unable to save this event. Browser storage may be full.");
    }
  }
  function update(values) {
    setDraft((old) => ({ ...old, ...values }));
  }
  function updateProfile(values) {
    const next = readProfile(values);
    if (!next) return false;
    try {
      writeLocal("melloway.profile", next);
      setProfile(next);
      setStatus("Profile saved on this device.");
      return true;
    } catch {
      setStatus("Couldn’t save your profile. Device storage may be full.");
      return false;
    }
  }
  return (
    <Context.Provider
      value={{
        draft,
        profile,
        updateProfile,
        update,
        startNew,
        setDraft,
        saved: savedPlans,
        savedPlaces,
        togglePlaceSave,
        history,
        startRoute,
        finishRoute,
        saveReview,
        completionId,
        completionMode,
        dismissCompletion: () => setCompletionId(""),
        openCompletion: (id, mode = "choice") => { setCompletionMode(mode); setCompletionId(id); },
        openSavedPlan,
        savedEvents,
        toggleEventSave,
        current,
        setCurrent,
        renameCurrentPlan,
        save,
        remove,
        status,
        setStatus,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
