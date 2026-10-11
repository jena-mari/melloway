// Animate centre and fractional zoom together, even when the destination is
// beyond the viewport where Google's built-in panTo would jump.
export function animateMapCamera(map, target, {
  duration = 650,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = frame => cancelAnimationFrame(frame),
} = {}) {
  const center = map.getCenter();
  const start = { lat: center?.lat(), lng: center?.lng(), zoom: map.getZoom() };
  if (!Object.values(start).every(Number.isFinite)) {
    map.moveCamera(target);
    return () => {};
  }
  const started = now();
  let frame, cancelled = false;
  function step(time) {
    if (cancelled) return;
    const progress = Math.min(1, Math.max(0, (time - started) / duration));
    if (progress === 1) {
      map.moveCamera(target);
      frame = null;
      return;
    }
    const ease = progress * progress * (3 - 2 * progress);
    map.moveCamera({
      center: {
        lat: start.lat + (target.center.lat - start.lat) * ease,
        lng: start.lng + (target.center.lng - start.lng) * ease,
      },
      zoom: start.zoom + (target.zoom - start.zoom) * ease,
    });
    frame = requestFrame(step);
  }
  frame = requestFrame(step);
  return () => {
    cancelled = true;
    if (frame != null) cancelFrame(frame);
  };
}
