const { contextBridge, ipcRenderer } = require("electron");

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
  onUpdate: (callback) =>
    ipcRenderer.on("data-update", (_, data) => callback(data)),
  onWatchlistUpdate: (callback) =>
    ipcRenderer.on("watchlist-update", (_, data) => callback(data)),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  triggerAgentAnalysis: () => ipcRenderer.invoke("trigger-agent-analysis"),
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
  agentApproveActions: (ids) => ipcRenderer.invoke("agent-approve-actions", ids),
  agentDismissActions: (ids) => ipcRenderer.invoke("agent-dismiss-actions", ids),
  agentGetProfile: () => ipcRenderer.invoke("agent-get-profile"),
  agentAutoClean: () => ipcRenderer.invoke("agent-auto-clean"),
});
