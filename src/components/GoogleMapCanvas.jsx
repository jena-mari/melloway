import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { loadGoogleMaps } from "../services/googleMaps";
import { animateMapCamera } from "../utils/mapCamera.js";

const located = (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng);

export default function GoogleMapCanvas({
  points, selectedId, onSelect, focusPoint, resetView, interactive = true, smoothFocus = false,
  groupNearby = false, fitPadding, markerContent, ariaLabel = "Google Maps",
  className = "map-canvas", statusClassName = "map-status", fallback,
  renderPreview, previewOnTap = false, routePaths, routeTransport = "Walking",
}) {
  const canvas = useRef(null);
  const view = useRef(null);
  const select = useRef(onSelect);
  const selected = useRef(selectedId);
  const focused = useRef(focusPoint);
  const stopCamera = useRef(() => {});
  const routeState = useRef({ paths: routePaths, transport: routeTransport });
  routeState.current = { paths: routePaths, transport: routeTransport };
  const reduced = useReducedMotion();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const previewRenderer = useRef(renderPreview);
  previewRenderer.current = renderPreview;
  const tapPreview = useRef(previewOnTap);
  tapPreview.current = previewOnTap;
  const closeTimer = useRef(null);
  function keepPreview() { clearTimeout(closeTimer.current); }
  function closePreview() { keepPreview(); setPreview(null); }
  function leavePreview() {
    keepPreview();
    closeTimer.current = setTimeout(() => setPreview(null), 250);
  }
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  selected.current = selectedId;
  focused.current = focusPoint;
  useEffect(() => {
    let cancelled = false;
    let clean = () => {};
    setStatus("loading");
    setError("");
    closePreview();
    const authFailure = () => { if (!cancelled) setStatus("error"); };
    window.addEventListener("melloway-map-auth-error", authFailure);
    loadGoogleMaps().then(({ maps, core, marker, mapId }) => {
      if (cancelled) return;
      const valid = points.filter(located);
      if (!valid.length) { setStatus("error"); return; }
      const map = new maps.Map(canvas.current, {
        center: { lat: valid[0].lat, lng: valid[0].lng }, zoom: 17, maxZoom: 18, mapId,
        disableDefaultUI: true, zoomControl: interactive,
        gestureHandling: interactive ? "cooperative" : "none",
        keyboardShortcuts: interactive, clickableIcons: false,
        ...(smoothFocus ? { isFractionalZoomEnabled: true } : {}),
      });
      let pins = [];
      let drawnZoom;
      let drawnProjection;
      const bounds = new core.LatLngBounds();
      valid.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));
      let routeLines = [];
      let routePositions = [];
      function fit() {
        stopCamera.current();
        if (focused.current && located(focused.current)) {
          map.setZoom(16);
          map.setCenter({ lat: focused.current.lat, lng: focused.current.lng });
        } else if (valid.length === 1) {
          map.setZoom(16);
          map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
        } else {
          const fitted = new window.google.maps.LatLngBounds();
          valid.forEach(point => fitted.extend({ lat: point.lat, lng: point.lng }));
          routePositions.forEach(point => fitted.extend(point));
          map.fitBounds(fitted, fitPadding ?? (groupNearby ? { top: 64, bottom: 20, left: 24, right: 24 }
            : { top: 60, bottom: 35, left: 45, right: 45 }));
        }
      }
      function selectPins() {
        pins.forEach(({ element, ids, pin }) => {
          const active = ids.includes(selected.current);
          element.classList.toggle("is-selected", active);
          element.setAttribute("aria-pressed", String(active));
          pin.zIndex = active ? 1000 : 0;
        });
      }
      function drawPins() {
        const zoom = map.getZoom();
        canvas.current.dataset.mapZoom = zoom;
        const projection = map.getProjection();
        // Keep focused buttons and open previews stable across idle events.
        // Only clustered route pins need regrouping when projection/zoom changes.
        if (pins.length && (!groupNearby ||
          (drawnZoom === zoom && drawnProjection === Boolean(projection)))) return;
        drawnZoom = zoom;
        drawnProjection = Boolean(projection);
        pins.forEach(({ pin }) => { pin.map = null; });
        const scale = 2 ** zoom;
        const groups = [];
        valid.forEach((point) => {
          const pixel = projection?.fromLatLngToPoint(new core.LatLng(point.lat, point.lng));
          const group = groupNearby && pixel && groups.find((group) =>
            Math.abs(group.pixel.x - pixel.x) * scale < 68 &&
            Math.abs(group.pixel.y - pixel.y) * scale < 50);
          if (group) group.points.push(point);
          else groups.push({ pixel, points: [point] });
        });
        pins = groups.map(({ points: group }) => {
          const point = group[0];
          const element = document.createElement("button");
          element.type = "button";
          element.className = point.className || "route-pin";
          element.setAttribute("aria-label", group.map((p) => p.ariaLabel || p.name).join(" · "));
          markerContent(element, group);
          if (previewRenderer.current) {
            const show = () => { keepPreview(); setPreview(group); };
            element.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") show(); });
            element.addEventListener("pointerleave", leavePreview);
            element.addEventListener("focus", show);
            element.addEventListener("blur", leavePreview);
          }
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (tapPreview.current && previewRenderer.current && (event.pointerType === "touch" || window.matchMedia("(hover: none)").matches)) {
              keepPreview();
              setPreview(group);
              return;
            }
            closePreview();
            select.current?.(point.id);
          });
          const pin = new marker.AdvancedMarkerElement({
            map, position: { lat: point.lat, lng: point.lng },
            content: element, title: group.map((p) => p.name).join(" · "),
          });
          return { pin, element, ids: group.map((p) => p.id) };
        });
        selectPins();
      }
      const line = groupNearby && routeState.current.paths === undefined ? new maps.Polyline({
        map, path: valid.map(({ lat, lng }) => ({ lat, lng })), strokeOpacity: 0,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: "#f39aad", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "12px" }],
      }) : null;
      function setRoutes(paths, transport) {
        routeLines.forEach(line => line.setMap(null));
        routePositions = (paths || []).flatMap(leg => leg.path);
        routeLines = (paths || []).flatMap(leg => [
          new maps.Polyline({ map, path: leg.path, strokeColor: "#ffffff", strokeOpacity: .95, strokeWeight: 9, zIndex: 1 }),
          new maps.Polyline({ map, path: leg.path, strokeColor: transport === "Walking" ? "#cc5478" : "#287665",
            strokeOpacity: 1, strokeWeight: 5, zIndex: 2 }),
        ]);
        canvas.current.dataset.routeMode = transport;
        canvas.current.dataset.routeLegs = String((paths || []).length);
        fit();
      }
      view.current = { map, fit, selectPins, setRoutes };
      setRoutes(routeState.current.paths, routeState.current.transport);
      fit();
      drawPins();
      const zoomListener = map.addListener("zoom_changed", drawPins);
      const readyListener = map.addListener("idle", () => {
        clearTimeout(timeout);
        drawPins();
        if (!cancelled) setStatus("ready");
      });
      const timeout = setTimeout(() => { if (!cancelled) setStatus("error"); }, 15000);
      const resize = new ResizeObserver(fit);
      resize.observe(canvas.current);
      clean = () => {
        stopCamera.current();
        clearTimeout(timeout);
        resize.disconnect();
        zoomListener.remove();
        readyListener.remove();
        pins.forEach(({ pin }) => { pin.map = null; });
        line?.setMap(null);
        routeLines.forEach(line => line.setMap(null));
        window.google.maps.event.clearInstanceListeners(map);
        canvas.current?.replaceChildren();
        view.current = null;
      };
    }).catch((error) => {
      if (!cancelled) { setError(error?.message || "Google Maps unavailable"); setStatus("error"); }
    });
    return () => {
      cancelled = true;
      keepPreview();
      window.removeEventListener("melloway-map-auth-error", authFailure);
      clean();
    };
  }, [points, interactive, groupNearby, fitPadding, markerContent, smoothFocus]);
  useEffect(() => { view.current?.setRoutes(routePaths, routeTransport); }, [routePaths, routeTransport]);
  useEffect(() => { view.current?.selectPins(); }, [selectedId]);
  useEffect(() => {
    stopCamera.current();
    if (!focusPoint || !view.current || !located(focusPoint)) return;
    const { map } = view.current;
    const position = { lat: focusPoint.lat, lng: focusPoint.lng };
    if (smoothFocus && !reduced) {
      const cancel = animateMapCamera(map, { center: position, zoom: 16 });
      stopCamera.current = cancel;
      return cancel;
    }
    map.setZoom(16);
    if (reduced) map.setCenter(position);
    else map.panTo(position);
  }, [focusPoint?.id, focusPoint?.lat, focusPoint?.lng, reduced, smoothFocus]);
  useEffect(() => { view.current?.fit(); }, [resetView]);
  return (
    <div className={`google-map-canvas ${className}`} role="region" aria-label={ariaLabel} data-map-state={status} data-map-error={error || undefined}
      onPointerLeave={leavePreview} onKeyDown={event => { if (event.key === "Escape" && preview) { event.stopPropagation(); closePreview(); } }}>
      <div ref={canvas} className="google-map-surface"
        onPointerDownCapture={() => stopCamera.current()}
        onWheelCapture={() => stopCamera.current()}
        onKeyDownCapture={() => stopCamera.current()} />
      {status === "loading" && <p className={statusClassName} role="status">loading Google Maps…</p>}
      {status === "error" && <div className="google-map-error">{fallback || <p role="status">Google Maps unavailable.</p>}</div>}
      {status === "ready" && preview && renderPreview && <div className="map-preview-layer"
        onPointerEnter={keepPreview} onPointerLeave={leavePreview}
        onFocus={keepPreview} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) leavePreview(); }}>
        {renderPreview(preview, id => { closePreview(); select.current?.(id); }, closePreview)}
      </div>}
    </div>
  );
}
