import { hack48Path, maxEventImageBytes } from "../data/hack48.js";
import { socialPost } from "../utils/social.js";

const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export const sharedMediaUrl = url => base + url;
async function request(path, options = {}) {
  const response = await fetch(base + hack48Path + path, options);
  let value;
  try { value = await response.json(); } catch { throw new Error("Hack48 could not be loaded. Check the connection to the shared server."); }
  if (!response.ok) throw new Error(value?.error || "Hack48 could not be updated. Please try again.");
  if (value?.event?.id !== "hack48-2026" || !Array.isArray(value.event.attachments)) throw new Error("Hack48 returned invalid event data.");
  return value.event;
}
export const loadHack48 = signal => request("", { signal });
const headers = code => {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(code)) throw new Error("Enter the organiser edit code to add media.");
  return { Authorization: `Bearer ${code}` };
};
export function addHack48Reel(url, code) {
  const post = socialPost(url);
  if (post?.platform !== "Instagram" || !post.url.includes("/reel/")) throw new Error("Paste a full Instagram Reel link.");
  return request("/reels", { method: "POST", headers: { ...headers(code), "Content-Type": "application/json" }, body: JSON.stringify({ url: post.url }) });
}
export function addHack48Image(file, code) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
  if (!file.size || file.size > maxEventImageBytes) throw new Error("Choose an image up to 1.5 MB.");
  return request("/images", { method: "POST", headers: { ...headers(code), "Content-Type": file.type }, body: file });
}
