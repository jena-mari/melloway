import { validPreferences } from "../utils/planner";
import { withScheduleDefaults } from "../utils/date";
import { createContext, useContext, useState, useEffect } from "react";
import { defaultDraft } from "../data/preferences";
import {
  readLocal,
  writeLocal,
  saveCloud,
  loadCloud,
  deleteCloud,
} from "../services/storage";
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
function validPlan(plan) {
  return Boolean(
    plan?.id &&
    validPreferences(plan.prefs) &&
    Array.isArray(plan.stops) &&
    plan.stops.length >= 1 &&
    plan.stops.length <= 14 &&
    plan.stops.every(
      (s) =>
        typeof s.id === "string" &&
        typeof s.name === "string" &&
        Array.isArray(s.tags) &&
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng) &&
        Number.isFinite(s.arrival),
    ),
  );
}
function readSaved() {
  const stored = readLocal("melloway.saved", []);
  return Array.isArray(stored) ? stored.filter(validPlan) : [];
}
function readCurrent() {
  const stored = readLocal("melloway.current", null);
  return validPlan(stored?.plan)
    ? {
        ...stored,
        candidates: Array.isArray(stored.candidates) ? stored.candidates : [],
        matrix: Array.isArray(stored.matrix) ? stored.matrix : [],
      }
    : null;
}

export function AppProvider({ children }) {
  const [draft, setDraft] = useState(readDraft);
  const [saved, setSaved] = useState(readSaved);
  const [current, setCurrent] = useState(readCurrent);
  const [savedEvents, setSavedEvents] = useState(() => {
    const ids = readLocal("melloway.savedEvents", []);
    return Array.isArray(ids)
      ? [...new Set(ids.filter((id) => typeof id === "string"))]
      : [];
  });
  const [status, setStatus] = useState("");
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
        plans = plans.filter(validPlan);
        if (plans.length)
          setSaved((old) =>
            Array.from(
              new Map([...old, ...plans].map((p) => [p.id, p])).values(),
            ),
          );
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
    try {
      writeLocal("melloway.current", current);
    } catch {}
  }, [current]);
  async function save(plan) {
    try {
      writeLocal(
        "melloway.saved",
        saved.some((p) => p.id === plan.id) ? saved : [plan, ...saved],
      );
      setSaved((old) =>
        old.some((p) => p.id === plan.id) ? old : [plan, ...old],
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
  return (
    <Context.Provider
      value={{
        draft,
        update,
        startNew,
        setDraft,
        saved,
        savedEvents,
        toggleEventSave,
        current,
        setCurrent,
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
