// Shared utilities — framework-agnostic, side-effect-free.
// Used by extension (TypeScript) and re-exported for desktop renderer via preload.

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str: string): string {
  return String(str).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}

/**
 * Format a timestamp into a human-readable relative string (Chinese locale).
 * @param {number} ts
 * @returns {string}
 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Return a date-group label for a timestamp: "今天", "昨天", or YYYY/MM/DD.
 * @param {number} ts
 * @returns {string}
 */
export function dateGroupLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Resolve the display color for a watchlist entry by domain or label.
 * @param {string} val
 * @param {Array<{domain:string, label?:string, color:string}>} watchlist
 * @returns {string}
 */
export function getDomainColor(
  val: string,
  watchlist: Array<{ domain: string; label?: string; color: string }>
): string {
  const entry = watchlist.find(
    (e) => e.domain === val || e.label === val,
  );
  return entry ? entry.color : "#767d88";
}

/**
 * Predicate: does a record match a search query?
 * @param {{title?:string, url?:string, matchedRule?:string}} r
 * @param {string} q
 * @returns {boolean}
 */
export function matchesSearch(r: { title?: string; url?: string; matchedRule?: string }, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    (r.title && typeof r.title === "string" && r.title.toLowerCase().includes(lower)) ||
    (r.url && typeof r.url === "string" && r.url.toLowerCase().includes(lower)) ||
    (r.matchedRule && typeof r.matchedRule === "string" && r.matchedRule.toLowerCase().includes(lower))
  );
}
