import { socialPost } from "./social.js";
import { validDate } from "./date.js";

const types = ["markets", "festivals", "exhibitions", "concerts", "community"];
const shortDate = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";

// Revalidate network responses and local snapshots; never accept arbitrary embeds.
export function instagramEvent(value) {
  const post = socialPost(value?.url);
  if (post?.platform !== "Instagram" || !validDate(value?.startDate)) return null;
  const endDate = value.endDate || value.startDate;
  if (!validDate(endDate) || endDate < value.startDate) return null;
  const title = text(value.title, 120), area = text(value.area, 180);
  if (!title || !area) return null;
  const start = shortDate.format(new Date(`${value.startDate}T12:00:00Z`));
  const end = shortDate.format(new Date(`${endDate}T12:00:00Z`));
  return {
    ...post, id: `instagram:${post.id}`, source: "instagram", title, area, theme: "pink",
    startDate: value.startDate, endDate,
    when: start === end ? start : `${start} – ${end}`,
    host: text(value.host, 80) || "Instagram", handle: text(value.handle, 64).replace(/^@/, ""),
    text: text(value.text, 240), type: types.includes(value.type) ? value.type : "community",
  };
}

export function instagramEvents(values) {
  const posts = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const post = instagramEvent(value);
    if (post && !posts.has(post.id)) posts.set(post.id, post);
  }
  return [...posts.values()];
}
