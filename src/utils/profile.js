import { sydneyToday, validDate } from "./date.js";

export function profileHandle(name = "") {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "")
      .slice(0, 24) || "you"
  );
}
export function profileSocialUrl(value, platform) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !["tiktok", "instagram"].includes(platform)
  )
    return "";
  try {
    const url = new URL(value.trim());
    const domain = `${platform}.com`;
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`))
    )
      return "";
    url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
}
export function validAvatar(value) {
  return (
    typeof value === "string" &&
    value.length < 1500000 &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}
export function readProfile(data) {
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    typeof data.handle !== "string" ||
    !/^[a-zA-Z0-9_.]{1,24}$/.test(data.handle)
  )
    return null;
  return {
    name: data.name.trim().slice(0, 40),
    handle: data.handle.toLowerCase(),
    bio: typeof data.bio === "string" ? data.bio.slice(0, 160) : "",
    location:
      typeof data.location === "string" ? data.location.slice(0, 60) : "",
    birthdate:
      validDate(data.birthdate) && data.birthdate <= sydneyToday()
        ? data.birthdate
        : "",
    tiktok: profileSocialUrl(data.tiktok, "tiktok"),
    instagram: profileSocialUrl(data.instagram, "instagram"),
    avatar: validAvatar(data.avatar) ? data.avatar : "",
    coverImage: validAvatar(data.coverImage) ? data.coverImage : "",
    cover: ["white", "matcha", "peach"].includes(data.cover)
      ? data.cover
      : "white",
  };
}
