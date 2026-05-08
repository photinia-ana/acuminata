const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const initSqlJs = require("sql.js");

const EXTENSION_PORT = 8766;
const DB_PATH = path.join(app.getPath("userData"), "tracker.db");

let mainWindow;
let extensionServer;
let extensionClients = new Set();
let watchlist = [{ domain: "bilibili.com", label: "B站", color: "#fb7299" }];
let enabled = true;
let db;
let saveTimer = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function markDirty() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    } catch (e) {
      // ignore
    }
  }, 1000);
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (e) {
    // ignore
  }
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  markDirty();
}

async function initDatabase() {
  const SQL = await initSqlJs();
  try {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } catch (e) {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL,
    matchedRule TEXT NOT NULL,
    tabId INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_records_ts ON records(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_records_mr ON records(matchedRule)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_records_dedup ON records(url, tabId, timestamp)`,
  );
  try {
    db.run("ALTER TABLE records ADD COLUMN pinned INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.run("ALTER TABLE records ADD COLUMN score INTEGER DEFAULT NULL");
  } catch (e) {}
  db.run(`CREATE TABLE IF NOT EXISTS watchlist (
    domain TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#5b8dee'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  markDirty();
}

function loadWatchlist() {
  const rows = dbAll("SELECT * FROM watchlist");
  if (rows.length === 0) {
    watchlist = [{ domain: "bilibili.com", label: "B站", color: "#fb7299" }];
    const stmt = db.prepare(
      "INSERT INTO watchlist (domain, label, color) VALUES (?, ?, ?)",
    );
    for (const entry of watchlist) {
      stmt.bind([entry.domain, entry.label, entry.color]);
      stmt.step();
      stmt.reset();
    }
    stmt.free();
    markDirty();
  } else {
    watchlist = rows;
  }
}

function loadSettings() {
  const row = dbGet("SELECT value FROM settings WHERE key = ?", ["enabled"]);
  if (row) {
    enabled = row.value === "true";
  } else {
    dbRun("INSERT INTO settings (key, value) VALUES (?, ?)", [
      "enabled",
      "true",
    ]);
  }
}

function broadcastToExtensions(data) {
  const msg = JSON.stringify(data);
  extensionClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("data-update", data);
  }
}

function startExtensionServer() {
  extensionServer = new WebSocket.Server({ port: EXTENSION_PORT });
  console.log(
    `[Server] Extension WebSocket server running on port ${EXTENSION_PORT}`,
  );

  extensionServer.on("connection", (ws) => {
    console.log("[Server] Extension connected");
    extensionClients.add(ws);

    ws.send(JSON.stringify({ type: "init", watchlist, enabled }));

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        handleExtensionMessage(ws, msg);
      } catch (e) {
        console.error("[Server] Invalid message:", e);
      }
    });

    ws.on("close", () => {
      extensionClients.delete(ws);
      console.log("[Server] Extension disconnected");
    });

    ws.on("error", (err) => {
      console.error("[Server] WebSocket error:", err);
      extensionClients.delete(ws);
    });
  });
}

function handleExtensionMessage(ws, msg) {
  switch (msg.type) {
    case "addRecord": {
      const now = Date.now();

      // 1. 获取当前站点的分组 Label (如果没备注，就用域名本身作为组)
      const currentWatch = watchlist.find((w) => w.domain === msg.matchedRule);
      const groupLabel = currentWatch
        ? currentWatch.label || msg.domain
        : msg.domain;

      // 2. 找出同属一个"伪装归类"的所有域名
      const groupDomains = watchlist
        .filter((w) => (w.label || w.domain) === groupLabel)
        .map((w) => w.domain);
      if (groupDomains.length === 0) groupDomains.push(msg.matchedRule);

      // 3. 解析当前访问的 Path (去除域名，只留 /u1/2 这种路径)
      let incomingPath = "";
      try {
        const u = new URL(msg.url);
        incomingPath = u.pathname + u.search + u.hash;
      } catch (e) {
        incomingPath = msg.url;
      }

      // 4. 在该归类下，查找是否已存在相同 Path 的记录
      const placeholders = groupDomains.map(() => "?").join(",");
      const groupRecords = dbAll(
        `SELECT * FROM records WHERE matchedRule IN (${placeholders}) ORDER BY timestamp DESC`,
        groupDomains,
      );

      let existing = null;
      for (const r of groupRecords) {
        try {
          const u = new URL(r.url);
          if (u.pathname + u.search + u.hash === incomingPath) {
            existing = r;
            break;
          }
        } catch (e) {
          if (r.url === msg.url) {
            existing = r;
            break;
          }
        }
      }

      if (existing) {
        // [防刷分] 同一标签页60秒内频繁刷新忽略
        if (msg.tabId === existing.tabId && now - existing.timestamp < 60000)
          return;

        let newPinned = 1;
        let newScore = existing.pinned ? (existing.score || 0) + 1 : 1;

        // 【核心】将旧记录的 URL、domain 更新为当前最新的伪装域名！
        dbRun(
          "UPDATE records SET url = ?, domain = ?, matchedRule = ?, pinned = ?, score = ?, timestamp = ? WHERE id = ?",
          [
            msg.url,
            msg.domain,
            msg.matchedRule,
            newPinned,
            newScore,
            now,
            existing.id,
          ],
        );

        existing.url = msg.url;
        existing.domain = msg.domain;
        existing.matchedRule = msg.matchedRule;
        existing.pinned = newPinned;
        existing.score = newScore;
        existing.timestamp = now;
        broadcastToExtensions({ type: "recordUpdated", record: existing });
        return;
      }

      // 如果是全新的路径，则正常插入
      const record = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        url: msg.url,
        title: msg.title || "",
        domain: msg.domain,
        matchedRule: msg.matchedRule,
        tabId: msg.tabId,
        timestamp: now,
      };
      dbRun(
        "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)",
        [
          record.id,
          record.url,
          record.title,
          record.domain,
          record.matchedRule,
          record.tabId,
          record.timestamp,
        ],
      );
      broadcastToExtensions({ type: "recordAdded", record });
      break;
    }
    case "getStats": {
      const stats = {};
      const rows = dbAll(
        "SELECT matchedRule, COUNT(*) as count FROM records GROUP BY matchedRule",
      );
      for (const r of rows) {
        stats[r.matchedRule] = r.count;
      }
      const total = dbGet("SELECT COUNT(*) as count FROM records").count;
      ws.send(JSON.stringify({ type: "stats", total, stats, enabled }));
      break;
    }
    case "updateWatchlist": {
      watchlist = msg.watchlist;
      dbRun("DELETE FROM watchlist");
      const stmt = db.prepare(
        "INSERT INTO watchlist (domain, label, color) VALUES (?, ?, ?)",
      );
      for (const entry of watchlist) {
        stmt.bind([entry.domain, entry.label, entry.color]);
        stmt.step();
        stmt.reset();
      }
      stmt.free();
      markDirty();
      broadcastToExtensions({ type: "watchlistUpdated", watchlist });
      break;
    }
    case "updateEnabled": {
      enabled = msg.enabled;
      dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
        "enabled",
        String(enabled),
      ]);
      broadcastToExtensions({ type: "enabledUpdated", enabled });
      break;
    }
    case "clearRecords": {
      dbRun("DELETE FROM records");
      broadcastToExtensions({ type: "recordsCleared" });
      break;
    }
    case "recordUpdated": {
      if (msg.record) {
        dbRun("UPDATE records SET pinned = ?, score = ? WHERE id = ?", [
          msg.record.pinned ? 1 : 0,
          msg.record.score,
          msg.record.id,
        ]);
        broadcastToExtensions({ type: "recordUpdated", record: msg.record });
      }
      break;
    }
    case "exportData": {
      const rows = dbAll("SELECT * FROM records ORDER BY timestamp DESC");
      ws.send(JSON.stringify({ type: "exportData", watchlist, records: rows }));
      break;
    }
  }
}

function createWindow() {
  const bounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    width: bounds ? bounds.width : 960,
    height: bounds ? bounds.height : 680,
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    minWidth: 750,
    minHeight: 500,
    title: "Site History Tracker",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", () => {
    saveWindowBounds();
  });

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }
}

function loadWindowBounds() {
  try {
    const x = dbGet("SELECT value FROM settings WHERE key = 'window.x'");
    const y = dbGet("SELECT value FROM settings WHERE key = 'window.y'");
    const w = dbGet("SELECT value FROM settings WHERE key = 'window.width'");
    const h = dbGet("SELECT value FROM settings WHERE key = 'window.height'");
    if (x && y && w && h) {
      return {
        x: parseInt(x.value, 10),
        y: parseInt(y.value, 10),
        width: parseInt(w.value, 10),
        height: parseInt(h.value, 10),
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('window.x', ?)", [
    String(bounds.x),
  ]);
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('window.y', ?)", [
    String(bounds.y),
  ]);
  dbRun(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('window.width', ?)",
    [String(bounds.width)],
  );
  dbRun(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('window.height', ?)",
    [String(bounds.height)],
  );
}

app.whenReady().then(async () => {
  app.setName("Site History Tracker");
  app.setAppUserModelId("com.roooyhe.site-history-tracker");
  await initDatabase();
  loadWatchlist();
  loadSettings();
  startExtensionServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  flushSave();
  if (extensionServer) extensionServer.close();
});

ipcMain.handle("get-watchlist", () => watchlist);

ipcMain.handle("get-records-page", (_, page, pageSize, filter) => {
  const offset = (page - 1) * pageSize;
  let countSql = "SELECT COUNT(*) as total FROM records";
  let dataSql =
    "SELECT * FROM records ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  let params = [pageSize, offset];
  let countParams = [];

  if (filter === "pinned") {
    countSql = "SELECT COUNT(*) as total FROM records WHERE pinned = 1";
    dataSql =
      "SELECT * FROM records WHERE pinned = 1 ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    countParams = [];
    params = [pageSize, offset];
  } else if (filter && filter !== "all") {
    // 此时传入的 filter 是归类名(Label)，找出归类下的所有域名一起查询
    const domains = watchlist
      .filter((w) => (w.label || w.domain) === filter)
      .map((w) => w.domain);
    if (domains.length > 0) {
      const placeholders = domains.map(() => "?").join(",");
      countSql = `SELECT COUNT(*) as total FROM records WHERE matchedRule IN (${placeholders})`;
      dataSql = `SELECT * FROM records WHERE matchedRule IN (${placeholders}) ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      countParams = domains;
      params = [...domains, pageSize, offset];
    }
  }

  const total = dbGet(countSql, countParams).total;
  const records = dbAll(dataSql, params);
  return { records, total, page, pageSize };
});

ipcMain.handle("get-statistics", () => {
  const total = dbGet("SELECT COUNT(*) as total FROM records").total;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = dbGet(
    "SELECT COUNT(*) as count FROM records WHERE timestamp >= ?",
    [todayStart.getTime()],
  ).count;

  const domainRows = dbAll(
    "SELECT matchedRule, COUNT(*) as count FROM records GROUP BY matchedRule ORDER BY count DESC",
  );

  const domainCounts = {};
  let topDomain = null;
  let topDomainCount = 0;

  // 【核心】将结果按伪装归类（Label）进行合并
  const ruleToLabel = {};
  watchlist.forEach((w) => {
    ruleToLabel[w.domain] = w.label || w.domain;
  });

  for (const r of domainRows) {
    const label = ruleToLabel[r.matchedRule] || r.matchedRule;
    domainCounts[label] = (domainCounts[label] || 0) + r.count;
  }

  for (const label in domainCounts) {
    if (!topDomain || domainCounts[label] > topDomainCount) {
      topDomain = label;
      topDomainCount = domainCounts[label];
    }
  }

  // 独立站点数量按归类计算
  const uniqueSites = new Set(watchlist.map((w) => w.label || w.domain)).size;

  return {
    total,
    today,
    sites: uniqueSites,
    enabled,
    domainCounts,
    topDomain,
    topDomainCount,
  };
});

ipcMain.handle("get-records", () => {
  return dbAll("SELECT * FROM records ORDER BY timestamp DESC");
});

ipcMain.handle("get-stats", () => {
  const stats = {};
  const rows = dbAll(
    "SELECT matchedRule, COUNT(*) as count FROM records GROUP BY matchedRule",
  );
  for (const r of rows) {
    stats[r.matchedRule] = r.count;
  }
  const total = dbGet("SELECT COUNT(*) as count FROM records").count;
  return { total, stats, enabled };
});

ipcMain.handle("add-watchlist", (_, entry) => {
  if (!watchlist.find((e) => e.domain === entry.domain)) {
    watchlist.push(entry);
    dbRun("INSERT INTO watchlist (domain, label, color) VALUES (?, ?, ?)", [
      entry.domain,
      entry.label,
      entry.color,
    ]);
    broadcastToExtensions({ type: "watchlistUpdated", watchlist });
    return true;
  }
  return false;
});

ipcMain.handle("remove-watchlist", (_, domain) => {
  const idx = watchlist.findIndex((e) => e.domain === domain);
  if (idx !== -1) {
    watchlist.splice(idx, 1);
    dbRun("DELETE FROM watchlist WHERE domain = ?", [domain]);
    broadcastToExtensions({ type: "watchlistUpdated", watchlist });
    return true;
  }
  return false;
});

ipcMain.handle("set-enabled", (_, val) => {
  enabled = val;
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    "enabled",
    String(enabled),
  ]);
  broadcastToExtensions({ type: "enabledUpdated", enabled });
});

ipcMain.handle("clear-records", () => {
  dbRun("DELETE FROM records");
  broadcastToExtensions({ type: "recordsCleared" });
});

ipcMain.handle("export-data", () => {
  const rows = dbAll("SELECT * FROM records ORDER BY timestamp DESC");
  return { watchlist, records: rows };
});

ipcMain.handle("open-url", (_, url) => {
  try {
    const u = new URL(url);
    const entry = watchlist.find(
      (w) => w.domain === u.hostname || url.includes(w.domain),
    );
    if (entry) {
      const groupLabel = entry.label || entry.domain;
      const groupDomains = watchlist
        .filter((w) => (w.label || w.domain) === groupLabel)
        .map((w) => w.domain);

      if (groupDomains.length > 1) {
        // 查找该伪装归类下，最近访问过的一个域名
        const placeholders = groupDomains.map(() => "?").join(",");
        const latestRecord = dbGet(
          `SELECT domain FROM records WHERE matchedRule IN (${placeholders}) ORDER BY timestamp DESC LIMIT 1`,
          groupDomains,
        );

        if (latestRecord && latestRecord.domain) {
          u.hostname = latestRecord.domain; // 偷梁换柱，将旧域名替换为最新域名
          return require("electron").shell.openExternal(u.toString());
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  require("electron").shell.openExternal(url);
});

ipcMain.handle("toggle-record-pin", (_, id, pinned, score) => {
  dbRun("UPDATE records SET pinned = ?, score = ? WHERE id = ?", [
    pinned ? 1 : 0,
    score,
    id,
  ]);
  const record = dbGet("SELECT * FROM records WHERE id = ?", [id]);
  if (record) {
    broadcastToExtensions({ type: "recordUpdated", record });
  }
  return !!record;
});

module.exports = { app };
