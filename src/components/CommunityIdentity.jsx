export function Avatar({ name, colour = "pink", src }) {
  return (
    <span className={`community-avatar avatar-${colour}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function timeAgo(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60000),
  );
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  });
}
