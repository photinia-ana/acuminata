const { contextBridge, ipcRenderer } = require("electron");

// ── 事件监听器管理 — R5.4: 添加 removeListener 防止内存泄漏 ──
const listenerRegistry = {
  "data-update": new Map(),
  "watchlist-update": new Map(),
};

function registerListener(channel, callback) {
  const id = Symbol(channel);
  listenerRegistry[channel].set(id, callback);
  ipcRenderer.on(channel, (_, data) => callback(data));
  return id;
}

function removeListener(channel, id) {
  const cb = listenerRegistry[channel].get(id);
  if (cb) {
    ipcRenderer.removeListener(channel, cb);
    listenerRegistry[channel].delete(id);
  }
}

contextBridge.exposeInMainWorld("electronAPI", {
  getWatchlist: () => ipcRenderer.invoke("get-watchlist"),
  getRecords: () => ipcRenderer.invoke("get-records"),
  deleteRecords: (ids) => ipcRenderer.invoke("delete-records", ids),
  getRecordsPage: (page, pageSize, filter) =>
    ipcRenderer.invoke("get-records-page", page, pageSize, filter),
  getStatistics: () => ipcRenderer.invoke("get-statistics"),
  getStats: () => ipcRenderer.invoke("get-stats"),
  addToWatchlist: (entry) => ipcRenderer.invoke("add-watchlist", entry),
  removeFromWatchlist: (domain) =>
    ipcRenderer.invoke("remove-watchlist", domain),
  toggleRecordPin: (id, pinned, score) =>
    ipcRenderer.invoke("toggle-record-pin", id, pinned, score),
  setEnabled: (enabled) => ipcRenderer.invoke("set-enabled", enabled),
  clearRecords: () => ipcRenderer.invoke("clear-records"),
  exportData: () => ipcRenderer.invoke("export-data"),

  // 事件监听 — R5.4 返回 listenerId，可移除
  onUpdate: (callback) => registerListener("data-update", callback),
  onWatchlistUpdate: (callback) => registerListener("watchlist-update", callback),
  removeListener: (channel, id) => removeListener(channel, id),

  openUrl: (url) => ipcRenderer.invoke("open-url", url),

  // Agent — R3: triggerAgentAnalysis 支持 command 参数
  triggerAgentAnalysis: (command) =>
    ipcRenderer.invoke("trigger-agent-analysis", command),
  getRecommendations: () => ipcRenderer.invoke("get-recommendations"),
  rejectRecommendation: (id) => ipcRenderer.invoke("reject-recommendation", id),
  acceptRecommendation: (id) => ipcRenderer.invoke("accept-recommendation", id),
  clearRecommendations: () => ipcRenderer.invoke("clear-recommendations"),

  getAiConfig: () => ipcRenderer.invoke("get-ai-config"),
  setAiConfig: (config) => ipcRenderer.invoke("set-ai-config", config),
  testAiConnection: () => ipcRenderer.invoke("test-ai-connection"),

  getLocale: () => ipcRenderer.invoke("get-locale"),
  setLocale: (code) => ipcRenderer.invoke("set-locale", code),

  agentGetPending: () => ipcRenderer.invoke("agent-get-pending"),
  agentApproveActions: (ids) =>
    ipcRenderer.invoke("agent-approve-actions", ids),
  agentDismissActions: (ids) =>
    ipcRenderer.invoke("agent-dismiss-actions", ids),
  agentGetProfile: () => ipcRenderer.invoke("agent-get-profile"),
  agentAutoClean: () => ipcRenderer.invoke("agent-auto-clean"),
});
