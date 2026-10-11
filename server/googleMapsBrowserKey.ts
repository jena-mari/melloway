/** Browser keys are public; private Places/Routes credentials are never fallbacks. */
export function selectGoogleMapsBrowserKey(env: { GOOGLE_MAPS_JS_KEY?: string; GOOGLE_MAPS_DEMO_KEY?: string } = process.env): string | null {
  return env.GOOGLE_MAPS_JS_KEY?.trim() || env.GOOGLE_MAPS_DEMO_KEY?.trim() || null;
}
