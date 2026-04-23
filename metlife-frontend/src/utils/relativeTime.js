/**
 * Human-readable relative time for UI ("2 min ago", "5h ago").
 * Parses ISO strings or Date; empty / invalid → "".
 */
export function formatRelativeTime(isoOrDate) {
  if (isoOrDate == null || isoOrDate === "") return "";
  const dt = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const t = dt.getTime();
  if (!Number.isFinite(t)) return "";

  let ms = Date.now() - t;
  if (ms < 0) ms = 0;

  const sec = Math.floor(ms / 1000);
  if (sec < 45) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const mins = Math.floor(sec / 60);
  if (mins < 60) return mins === 1 ? "1 min ago" : `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days < 14) return days === 1 ? "1 day ago" : `${days}d ago`;

  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: dt.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
