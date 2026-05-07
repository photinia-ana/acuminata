const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getWatchlist: () => ipcRenderer.invoke('get-watchlist'),
  getRecords: () => ipcRenderer.invoke('get-records'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  addToWatchlist: (entry) => ipcRenderer.invoke('add-watchlist', entry),
  removeFromWatchlist: (domain) => ipcRenderer.invoke('remove-watchlist', domain),
  setEnabled: (enabled) => ipcRenderer.invoke('set-enabled', enabled),
  clearRecords: () => ipcRenderer.invoke('clear-records'),
  exportData: () => ipcRenderer.invoke('export-data'),
  onUpdate: (callback) => ipcRenderer.on('data-update', (_, data) => callback(data)),
  onWatchlistUpdate: (callback) => ipcRenderer.on('watchlist-update', (_, data) => callback(data)),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});