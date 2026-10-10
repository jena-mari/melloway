import { useEffect, useRef, useState } from "react";
import { Search, MapPin, X, Check, LoaderCircle } from "lucide-react";
import { searchLocations, resolveLocation } from "../services/discovery";
import { createId } from "../utils/id";
import { validLocation } from "../utils/location";

export default function LocationSearch({ draft, update }) {
  const [query, setQuery] = useState(draft.locationQuery ?? draft.area);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [source, setSource] = useState(draft.location ? "google" : "local");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const root = useRef(null);
  const session = useRef(null);
  const selectionRequest = useRef(null);
  const selected = query === draft.area;
  useEffect(() => () => selectionRequest.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    // Dismiss after the outside click lands so collapsing results cannot move
    // a button between pointer-down and pointer-up.
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setBusy(false);
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setSuggestions([]);
    const timer = setTimeout(async () => {
      session.current ||= createId();
      try {
        const result = await searchLocations(
          query.trim(),
          session.current,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSuggestions(result.suggestions || []);
        setSource(result.source);
        setActive(0);
      } catch {
        // The search service handles local fallback; cancellation has no message.
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);
  function edit(value) {
    if (selectionRequest.current && !selectionRequest.current.signal.aborted)
      session.current = null;
    selectionRequest.current?.abort();
    setResolving(false);
    setQuery(value);
    setOpen(true);
    setError("");
    setSuggestions([]);
    update(
      value.trim()
        ? { locationQuery: value }
        : { locationQuery: "", area: "Anywhere in Sydney", location: null },
    );
  }
  async function choose(suggestion) {
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    const token = (session.current ||= createId());
    setResolving(true);
    setError("");
    try {
      const location =
        suggestion.source === "google"
          ? await resolveLocation(suggestion.id, token, controller.signal)
          : null;
      if (controller.signal.aborted) return;
      if (suggestion.source === "google" && !validLocation(location))
        throw new Error("Location unavailable");
      const area = location?.name || suggestion.name;
      update({ area, location, locationQuery: area });
      setQuery(area);
      setSource(suggestion.source);
      setOpen(false);
      input.current?.focus({ preventScroll: true });
    } catch {
      if (!controller.signal.aborted)
        setError("couldn’t select that spot. try again or choose another.");
    } finally {
      if (session.current === token) session.current = null;
      if (selectionRequest.current === controller)
        selectionRequest.current = null;
      if (!controller.signal.aborted) setResolving(false);
    }
  }
  function anywhere() {
    selectionRequest.current?.abort();
    setResolving(false);
    update({ area: "Anywhere in Sydney", location: null, locationQuery: "" });
    setQuery("");
    setOpen(false);
    setSource("local");
    setError("");
    session.current = null;
  }
  const expanded = open && suggestions.length > 0;
  return (
    <div
      className="location-search"
      ref={root}
      onKeyDownCapture={(e) => {
        if (e.key === "Tab") setOpen(false);
      }}
    >
      <label htmlFor="area-search" className="location-label">
        any specific location in mind?
      </label>
      <div className="location-input">
        <Search size={19} aria-hidden="true" />
        <input
          id="area-search"
          ref={input}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="suburb, address or favourite spot"
          value={query}
          maxLength={150}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="sydney-location-results"
          aria-activedescendant={
            expanded ? `location-option-${active}` : undefined
          }
          aria-describedby="location-help"
          onFocus={() => setOpen(true)}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            } else if (
              (e.key === "ArrowDown" || e.key === "ArrowUp") &&
              suggestions.length
            ) {
              e.preventDefault();
              setOpen(true);
              setActive(
                (i) =>
                  (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) %
                  suggestions.length,
              );
            } else if (e.key === "Enter" && expanded) {
              e.preventDefault();
              if (!resolving) choose(suggestions[active]);
            }
          }}
        />
        {resolving || busy ? (
          <LoaderCircle
            className="location-spinner"
            size={18}
            aria-hidden="true"
          />
        ) : query ? (
          <button
            type="button"
            aria-label="clear location search"
            onClick={() => {
              edit("");
              input.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        ) : null}
      </div>
      <p className="location-help" id="location-help">
        in and around Sydney. pick a suggestion to set ur spot.
      </p>
      {(open || draft.location) && (
        <div className="location-results">
          {open && (
            <>
              <div
                id="sydney-location-results"
                role="listbox"
                aria-label="Sydney location suggestions"
                aria-busy={busy || resolving}
              >
                {suggestions.map((item, i) => (
                  <button
                    type="button"
                    role="option"
                    tabIndex={-1}
                    key={item.id}
                    id={`location-option-${i}`}
                    aria-selected={i === active}
                    disabled={resolving}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                    className={i === active ? "active" : ""}
                  >
                    <MapPin size={17} aria-hidden="true" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.address}</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="location-search-status" role="status">
                {resolving
                  ? "finding that spot…"
                  : busy
                    ? "looking around Sydney…"
                    : query.trim().length < 2
                      ? "type a little more to search."
                      : !suggestions.length
                        ? "no matches here. try a suburb or another spot."
                        : `${suggestions.length} suggestions`}
              </p>
            </>
          )}
          {source === "google" ? (
            <p className="google-search-attribution" translate="no">
              Google Maps
            </p>
          ) : (
            open && (
              <p className="local-search-note">
                local areas · Google search is unavailable right now
              </p>
            )
          )}
        </div>
      )}
      {selected && !open && (
        <p className="chosen-location">
          <Check size={14} />
          {draft.location ? `around ${draft.location.name}` : draft.area}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="anywhere-location" onClick={anywhere}>
        anywhere in Sydney is good
      </button>
    </div>
  );
}
