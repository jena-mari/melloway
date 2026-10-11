// Accept individual public posts only; never arbitrary iframe or fetch URLs.
export function socialPost(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "tiktok.com") {
      const match = url.pathname.match(
        /^\/@([\w.-]{1,64})\/video\/(\d{15,25})\/?$/,
      );
      if (!match) return null;
      return {
        platform: "TikTok",
        id: match[2],
        url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`,
      };
    }
    if (host === "instagram.com") {
      const match = url.pathname.match(/^\/(?:[\w.]{1,30}\/)?(p|reel)\/([\w-]{5,40})\/?$/);
      if (!match) return null;
      return {
        platform: "Instagram",
        id: match[2],
        url: `https://www.instagram.com/${match[1]}/${match[2]}/`,
      };
    }
  } catch {
    /* Invalid or unsupported link. */
  }
  return null;
}

export function socialEmbed(post) {
  const valid = socialPost(post.url);
  if (!valid) return null;
  return valid.platform === "TikTok"
    ? `https://www.tiktok.com/player/v1/${valid.id}?autoplay=0&description=1`
    : `${valid.url}embed/`;
}
