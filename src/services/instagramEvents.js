import { discoverInstagramEvents } from "./social.js";
import { readLocal, writeLocal } from "./storage.js";
import { instagramEvents } from "../utils/instagramEvents.js";

const key = "melloway.instagramEvents";
export const savedInstagramEvents = () => instagramEvents(readLocal(key, []));

export async function loadInstagramEvents(signal) {
  const result = await discoverInstagramEvents(signal);
  const posts = instagramEvents(result.posts);
  if (posts.length) {
    // Keep snapshots so saved/liked posts still open after search results change.
    const merged = instagramEvents([...posts, ...savedInstagramEvents()]).slice(0, 200);
    try { writeLocal(key, merged); } catch { /* The live feed remains usable. */ }
  }
  return { ...result, posts };
}
