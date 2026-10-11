import { socialPost } from "../utils/social.js";
const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
async function request(path, body, signal) {
  const response = await fetch(`${base}/api/social/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const messages = {
      authentication: "Instagram discovery needs a valid server OpenAI key.",
      rate_limit: "Instagram discovery is temporarily limited. Try again later.",
      configuration: "Instagram discovery couldn’t complete its web-search request.",
    };
    throw new Error(path === "events" ? messages[failure?.code] || "Instagram posts are unavailable right now." : "Posts unavailable");
  }
  return response.json();
}
function safePost(post) {
  const canonical = socialPost(post?.url);
  if (!canonical) return null;
  return { ...post, ...canonical };
}
export async function discoverSocial(venue, signal) {
  const response = await fetch(`${base}/api/status`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok || (await response.json()).socialDiscovery !== "openai")
    return [];
  const data = await request(
    "search",
    {
      venue: {
        name: venue.name,
        address: venue.address || "",
        lat: venue.lat,
        lng: venue.lng,
      },
    },
    signal,
  );
  return (Array.isArray(data.posts) ? data.posts : [])
    .map(safePost)
    .filter(Boolean)
    .slice(0, 8);
}
export async function previewSocial(url, signal) {
  const post = socialPost(url);
  if (!post) throw new Error("Use a TikTok video or Instagram post link.");
  try {
    const data = await request("preview", { url: post.url }, signal);
    return safePost(data.post) || post;
  } catch (error) {
    if (signal.aborted) throw error;
    return post; // The official embed and original link still work without the API.
  }
}

export async function discoverInstagramEvents(signal) {
  const response = await fetch(`${base}/api/status`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new Error("Instagram posts are unavailable right now.");
  if ((await response.json()).socialDiscovery !== "openai")
    return { posts: [], available: false };
  const data = await request("events", {}, signal);
  return { posts: Array.isArray(data.posts) ? data.posts : [], available: true };
}
