const { contextBridge, ipcRenderer } = require("electron");
const {
  escapeHtml,
  formatTime,
  dateGroupLabel,
  getDomainColor,
  matchesSearch,
} = require("../shared/utils");

// ── Route table ──────────────────────────────────────────────────────────────
// Each entry: { channel, invoke: true|false }
// invoke = true  → ipcRenderer.invoke (returns a promise)
// invoke = false → ipcRenderer.on (event listener)

const ROUTES = [
  // Records
  { channel: "records:page", invoke: true },
  { channel: "records:list", invoke: true },
  { channel: "records:stats", invoke: true },
  { channel: "records:clear", invoke: true },
  { channel: "records:delete", invoke: true },
  { channel: "records:export", invoke: true },
  { channel: "records:pin", invoke: true },
  { channel: "records:open-url", invoke: true },
  // Watchlist
  { channel: "watchlist:get", invoke: true },
  { channel: "watchlist:add", invoke: true },
  { channel: "watchlist:remove", invoke: true },
  // Settings
  { channel: "settings:enabled", invoke: true },
  { channel: "settings:set-enabled", invoke: true },
  { channel: "settings:bounds", invoke: true },
  { channel: "settings:save-bounds", invoke: true },
  // Locale
  { channel: "locale:get", invoke: true },
  { channel: "locale:set", invoke: true },
  // AI
  { channel: "ai:config:get", invoke: true },
  { channel: "ai:config:set", invoke: true },
  // Recommendations
  { channel: "recommendations:list", invoke: true },
  { channel: "recommendations:reject", invoke: true },
  { channel: "recommendations:accept", invoke: true },
  { channel: "recommendations:clear", invoke: true },
  // Agent
  { channel: "agent:pending", invoke: true },
  { channel: "agent:approve", invoke: true },
  { channel: "agent:dismiss", invoke: true },
  { channel: "agent:profile", invoke: true },
  { channel: "agent:analyze", invoke: true },
  { channel: "agent:auto-clean", invoke: true },
  // Data-update events (broadcast from main)
  { channel: "data-update", invoke: false },
];

// ── Generate API ─────────────────────────────────────────────────────────────

const api = {};

for (const route of ROUTES) {
  if (route.invoke) {
    api[route.channel] = (...args) =>
      ipcRenderer.invoke(route.channel, ...args);
  } else {
    api[`on${route.channel.split(":").map((s) => s[0].toUpperCase() + s.slice(1)).join("")}`] =
      (callback) =>
        ipcRenderer.on(route.channel, (_, data) => callback(data));
  }
}

contextBridge.exposeInMainWorld("electronAPI", api);
contextBridge.exposeInMainWorld("sharedUtils", {
  escapeHtml,
  formatTime,
  dateGroupLabel,
  getDomainColor,
  matchesSearch,
});
