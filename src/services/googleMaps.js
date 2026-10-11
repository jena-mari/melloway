const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
let pending;

// One SDK load shared by every map, including expanded dialogs.
export function loadGoogleMaps() {
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${base}/api/maps/config`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Google Maps unavailable");
      const { apiKey, mapId } = await response.json();
      if (!apiKey) throw new Error("Google Maps unavailable");
      if (!window.google?.maps?.importLibrary) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          const callback = "__mellowayGoogleMapsLoaded";
          const url = new URL("https://maps.googleapis.com/maps/api/js");
          url.searchParams.set("key", apiKey);
          url.searchParams.set("callback", callback);
          url.searchParams.set("loading", "async");
          url.searchParams.set("v", "weekly");
          url.searchParams.set("libraries", "marker");
          url.searchParams.set("region", "AU");
          script.src = url.href;
          script.async = true;
          const clean = () => {
            clearTimeout(timeout);
            delete window[callback];
            window.removeEventListener("melloway-map-auth-error", fail);
          };
          const fail = () => {
            clean();
            script.remove();
            reject(new Error("Google Maps unavailable"));
          };
          const timeout = setTimeout(fail, 15000);
          window[callback] = () => { clean(); resolve(); };
          const previousAuthFailure = window.gm_authFailure;
          window.gm_authFailure = () => {
            window.dispatchEvent(new Event("melloway-map-auth-error"));
            previousAuthFailure?.();
          };
          script.onerror = fail;
          window.addEventListener("melloway-map-auth-error", fail);
          document.head.append(script);
        });
      }
      const [maps, core, marker] = await Promise.all([
        window.google.maps.importLibrary("maps"),
        window.google.maps.importLibrary("core"),
        window.google.maps.importLibrary("marker"),
      ]);
      return { maps, core, marker, mapId };
    })().catch((error) => { pending = null; throw error; });
  }
  return pending;
}
