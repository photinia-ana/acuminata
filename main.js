const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = 8765;
const EXTENSION_PORT = 8766;

let mainWindow;
let extensionServer;
let extensionClients = new Set();
let records = [];
let watchlist = [{ domain: 'bilibili.com', label: 'B站', color: '#fb7299' }];
let enabled = true;
const MAX_RECORDS = 10000;
const RECORDS_FILE = path.join(app.getPath('userData'), 'records.json');
const WATCHLIST_FILE = path.join(app.getPath('userData'), 'watchlist.json');

function loadData() {
  try {
    if (fs.existsSync(RECORDS_FILE)) {
      records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8'));
    }
  } catch (e) {
    records = [];
  }
  try {
    if (fs.existsSync(WATCHLIST_FILE)) {
      watchlist = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
    }
  } catch (e) {
    watchlist = [{ domain: 'bilibili.com', label: 'B站', color: '#fb7299' }];
  }
}

function saveData() {
  try {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
  } catch (e) {}
  try {
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2));
  } catch (e) {}
}

function broadcastToExtensions(data) {
  const msg = JSON.stringify(data);
  extensionClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data-update', data);
  }
}

function startExtensionServer() {
  extensionServer = new WebSocket.Server({ port: EXTENSION_PORT });
  console.log(`[Server] Extension WebSocket server running on port ${EXTENSION_PORT}`);

  extensionServer.on('connection', (ws) => {
    console.log('[Server] Extension connected');
    extensionClients.add(ws);

    ws.send(JSON.stringify({ type: 'init', watchlist, records, enabled }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleExtensionMessage(ws, msg);
      } catch (e) {
        console.error('[Server] Invalid message:', e);
      }
    });

    ws.on('close', () => {
      extensionClients.delete(ws);
      console.log('[Server] Extension disconnected');
    });

    ws.on('error', (err) => {
      console.error('[Server] WebSocket error:', err);
      extensionClients.delete(ws);
    });
  });
}

function handleExtensionMessage(ws, msg) {
  switch (msg.type) {
    case 'addRecord': {
      const now = Date.now();
      const isDuplicate = records.some(r =>
        r.url === msg.url && r.tabId === msg.tabId && (now - r.timestamp) < 60000
      );
      if (isDuplicate) return;

      const record = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        url: msg.url,
        title: msg.title || '',
        domain: msg.domain,
        matchedRule: msg.matchedRule,
        tabId: msg.tabId,
        timestamp: now,
      };
      records.unshift(record);
      if (records.length > MAX_RECORDS) records.splice(MAX_RECORDS);
      saveData();
      broadcastToExtensions({ type: 'recordAdded', record });
      break;
    }
    case 'getStats': {
      const stats = {};
      for (const r of records) {
        stats[r.matchedRule] = (stats[r.matchedRule] || 0) + 1;
      }
      ws.send(JSON.stringify({ type: 'stats', total: records.length, stats, enabled }));
      break;
    }
    case 'updateWatchlist': {
      watchlist = msg.watchlist;
      saveData();
      broadcastToExtensions({ type: 'watchlistUpdated', watchlist });
      break;
    }
    case 'updateEnabled': {
      enabled = msg.enabled;
      saveData();
      broadcastToExtensions({ type: 'enabledUpdated', enabled });
      break;
    }
    case 'clearRecords': {
      records = [];
      saveData();
      broadcastToExtensions({ type: 'recordsCleared' });
      break;
    }
    case 'exportData': {
      ws.send(JSON.stringify({ type: 'exportData', watchlist, records }));
      break;
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  loadData();
  startExtensionServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (extensionServer) extensionServer.close();
});

ipcMain.handle('get-watchlist', () => watchlist);
ipcMain.handle('get-records', () => records);
ipcMain.handle('get-stats', () => {
  const stats = {};
  for (const r of records) {
    stats[r.matchedRule] = (stats[r.matchedRule] || 0) + 1;
  }
  return { total: records.length, stats, enabled };
});
ipcMain.handle('add-watchlist', (_, entry) => {
  if (!watchlist.find(e => e.domain === entry.domain)) {
    watchlist.push(entry);
    saveData();
    broadcastToExtensions({ type: 'watchlistUpdated', watchlist });
    return true;
  }
  return false;
});
ipcMain.handle('remove-watchlist', (_, domain) => {
  const idx = watchlist.findIndex(e => e.domain === domain);
  if (idx !== -1) {
    watchlist.splice(idx, 1);
    saveData();
    broadcastToExtensions({ type: 'watchlistUpdated', watchlist });
    return true;
  }
  return false;
});
ipcMain.handle('set-enabled', (_, val) => {
  enabled = val;
  saveData();
  broadcastToExtensions({ type: 'enabledUpdated', enabled });
});
ipcMain.handle('clear-records', () => {
  records = [];
  saveData();
  broadcastToExtensions({ type: 'recordsCleared' });
});
ipcMain.handle('export-data', () => ({ watchlist, records }));
ipcMain.handle('open-url', (_, url) => {
  require('electron').shell.openExternal(url);
});

module.exports = { app };