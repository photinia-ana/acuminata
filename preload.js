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
});
