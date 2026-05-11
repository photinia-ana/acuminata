const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const initSqlJs = require("sql.js");
const { getTool, getReadTools, getWriteTools, getOpenAITools, getAnthropicTools } = require("./agent/tools");
const { agentLoop, getPendingActions, clearPendingActions, addPendingAction, executeApprovedActions } = require("./agent/executor");
const { getAgentProfile, saveAgentProfile, buildDeleteReflectionPrompt, buildRejectReflectionPrompt, applyReflection } = require("./agent/reflect");

const EXTENSION_PORT = 8766;
const DB_PATH = path.join(app.getPath("userData"), "tracker.db");

let mainWindow;
let extensionServer;
let extensionClients = new Set();
let watchlist = [{ domain: "bilibili.com", label: "B站", color: "#fb7299" }];
let enabled = true;
let aiConfig = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  apiKey: "",
  model: "qwen2.5:7b",
};
let db;
let saveTimer = null;
let locale = {};
let localeCode = "zh-CN";
let pendingAgentActions = [];

function t(key, params) {
  let str = locale[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace("{" + k + "}", v);
    }
  }
  return str;
}

function loadLocale() {
  const row = dbGet("SELECT value FROM settings WHERE key = ?", ["locale"]);
  if (row) localeCode = row.value;
  else {
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["locale", localeCode]);
  }
  try {
    const file = path.join(__dirname, "locales", localeCode + ".json");
    locale = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    try {
      const file = path.join(__dirname, "locales", "zh-CN.json");
      locale = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e2) {
      locale = {};
    }
  }
}

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
  // === 新增：加入创建时间和更新时间字段 ===
  try {
    db.run("ALTER TABLE records ADD COLUMN createdAt INTEGER DEFAULT NULL");
  } catch (e) {}
  try {
    db.run("ALTER TABLE records ADD COLUMN updatedAt INTEGER DEFAULT NULL");
  } catch (e) {}
  try {
    db.run("ALTER TABLE records ADD COLUMN favIconUrl TEXT DEFAULT ''");
  } catch (e) {}
  try {
    db.run("ALTER TABLE records ADD COLUMN description TEXT DEFAULT ''");
  } catch (e) {}
  try {
    db.run("ALTER TABLE records ADD COLUMN ogImage TEXT DEFAULT ''");
  } catch (e) {}
  try {
    db.run("ALTER TABLE records ADD COLUMN dwellTime INTEGER DEFAULT 0");
  } catch (e) {}
  db.run(`CREATE TABLE IF NOT EXISTS watchlist (
    domain TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#5b8dee'
  )`);
  // === 新增：为观察列表添加正则过滤字段 ===
  try {
    db.run("ALTER TABLE watchlist ADD COLUMN regexFilter TEXT DEFAULT ''");
  } catch (e) {}
  try {
    db.run("ALTER TABLE watchlist ADD COLUMN regexTarget TEXT DEFAULT 'url'");
  } catch (e) {}
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    domain TEXT NOT NULL,
    groupLabel TEXT NOT NULL,
    reason TEXT,
    status INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL
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
  const aiProvider = dbGet("SELECT value FROM settings WHERE key = ?", [
    "ai.provider",
  ]);
  const aiEndpoint = dbGet("SELECT value FROM settings WHERE key = ?", [
    "ai.endpoint",
  ]);
  const aiApiKey = dbGet("SELECT value FROM settings WHERE key = ?", [
    "ai.apiKey",
  ]);
  const aiModel = dbGet("SELECT value FROM settings WHERE key = ?", [
    "ai.model",
  ]);
  if (aiProvider) aiConfig.provider = aiProvider.value;
  if (aiEndpoint) aiConfig.endpoint = aiEndpoint.value;
  if (aiApiKey) aiConfig.apiKey = aiApiKey.value;
  if (aiModel) aiConfig.model = aiModel.value;
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

      // === 新增：伪装组正则验证逻辑 ===
      // 找出该分组下所有配置了有效正则表达式的规则
      const groupRules = watchlist.filter(
        (w) =>
          (w.label || w.domain) === groupLabel &&
          w.regexFilter &&
          w.regexFilter.trim() !== "",
      );

      // 如果该组配置了正则，则当前访问记录必须命中其中至少一条才能放行
      if (groupRules.length > 0) {
        let isMatch = false;
        for (const rule of groupRules) {
          try {
            // i 标志表示忽略大小写
            const regex = new RegExp(rule.regexFilter.trim());
            // 判断是匹配 title 还是 url
            const targetStr =
              rule.regexTarget === "title" ? msg.title || "" : msg.url;
            if (regex.test(targetStr)) {
              isMatch = true;
              break;
            }
          } catch (e) {
            console.error("Invalid Regex:", rule.regexFilter); // 忽略不合法的正则
          }
        }
        // 如果没有命中任何一条规则，直接丢弃该记录，不作保存
        if (!isMatch) return;
      }

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
        // 防手抖：同一标签页60秒内频繁刷新忽略
        if (msg.tabId === existing.tabId && now - existing.timestamp < 60000)
          return;

        // === 核心：每日限频 +Pin 逻辑 ===
        const todayStr = new Date(now).toDateString();
        // 兼容旧数据：如果没有 createdAt，就用旧的 timestamp
        const createdAt = existing.createdAt || existing.timestamp;
        const isCreatedToday = new Date(createdAt).toDateString() === todayStr;
        const isUpdatedToday = existing.updatedAt
          ? new Date(existing.updatedAt).toDateString() === todayStr
          : false;

        let newPinned = 1;
        let newScore = existing.score || 0;
        let newUpdatedAt = existing.updatedAt;

        if (!existing.pinned) {
          // 情况A：以前没被 Pin 过。今天是第一次复访，直接 Pin 并给 1 分。
          newScore = 1;
          newUpdatedAt = now;
        } else if (!isCreatedToday && !isUpdatedToday) {
          // 情况B：不是今天创建的，且今天也没加过分。允许 +1 分。
          newScore += 1;
          newUpdatedAt = now;
        }

        // 更新数据库（即使不加分，依然把 timestamp 更新为 now，让它排到列表最前面）
        dbRun(
          "UPDATE records SET url = ?, domain = ?, matchedRule = ?, pinned = ?, score = ?, timestamp = ?, updatedAt = ? WHERE id = ?",
          [
            msg.url,
            msg.domain,
            msg.matchedRule,
            newPinned,
            newScore,
            now,
            newUpdatedAt,
            existing.id,
          ],
        );

        existing.url = msg.url;
        existing.domain = msg.domain;
        existing.matchedRule = msg.matchedRule;
        existing.pinned = newPinned;
        existing.score = newScore;
        existing.timestamp = now;
        existing.updatedAt = newUpdatedAt;
        broadcastToExtensions({ type: "recordUpdated", record: existing });
        return;
      }

      // === 全新访问插入逻辑 (新增 createdAt, updatedAt) ===
      const record = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        url: msg.url,
        title: msg.title || "",
        domain: msg.domain,
        matchedRule: msg.matchedRule,
        tabId: msg.tabId,
        timestamp: now,
        favIconUrl: msg.favIconUrl || "",
        description: msg.description || "",
        ogImage: msg.ogImage || "",
      };
      dbRun(
        "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, createdAt, updatedAt, favIconUrl, description, ogImage) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?, ?)",
        [
          record.id,
          record.url,
          record.title,
          record.domain,
          record.matchedRule,
          record.tabId,
          record.timestamp,
          now,
          record.favIconUrl,
          record.description,
          record.ogImage,
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
        "INSERT INTO watchlist (domain, label, color, regexFilter, regexTarget) VALUES (?, ?, ?, ?, ?)",
      );
      for (const entry of watchlist) {
        stmt.bind([
          entry.domain,
          entry.label,
          entry.color,
          entry.regexFilter || "",
          entry.regexTarget || "url",
        ]);
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
        dbRun(
          "UPDATE records SET pinned = ?, score = ?, description = ?, ogImage = ?, dwellTime = ? WHERE id = ?",
          [
            msg.record.pinned ? 1 : 0,
            msg.record.score,
            msg.record.description || "",
            msg.record.ogImage || "",
            msg.record.dwellTime || 0,
            msg.record.id,
          ],
        );
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
    title: "Acuminata",
    icon: path.join(__dirname, "build", "icon.png"),
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
  app.setName("ACUMINATA");
  app.setAppUserModelId("com.roooyhe.acuminata");
  await initDatabase();
  loadWatchlist();
  loadSettings();
  loadLocale();
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
    entry.regexFilter = entry.regexFilter || "";
    entry.regexTarget = entry.regexTarget || "url";
    watchlist.push(entry);
    dbRun(
      "INSERT INTO watchlist (domain, label, color, regexFilter, regexTarget) VALUES (?, ?, ?, ?, ?)",
      [
        entry.domain,
        entry.label,
        entry.color,
        entry.regexFilter,
        entry.regexTarget,
      ],
    );
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

ipcMain.handle("delete-records", (_, ids) => {
  if (!ids || ids.length === 0) return false;
  const placeholders = ids.map(() => "?").join(",");
  const deletedRecords = dbAll(`SELECT * FROM records WHERE id IN (${placeholders})`, ids);
  dbRun(`DELETE FROM records WHERE id IN (${placeholders})`, ids);
  broadcastToExtensions({ type: "recordsCleared" });
  if (deletedRecords.length > 0) {
    setImmediate(() => triggerReflectionOnDelete(deletedRecords));
  }
  return true;
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
  // 手动操作也记录为今天已更新，防止后续自动复访重复加分
  dbRun(
    "UPDATE records SET pinned = ?, score = ?, updatedAt = ? WHERE id = ?",
    [pinned ? 1 : 0, score, Date.now(), id],
  );
  const record = dbGet("SELECT * FROM records WHERE id = ?", [id]);
  if (record) {
    broadcastToExtensions({ type: "recordUpdated", record });
  }
  return !!record;
});

// ── Agent Tool Handler Map ──

const toolHandlers = {
  search_records: (args) => {
    const query = args.query || "";
    const limit = Math.min(args.limit || 50, 200);
    const minScore = args.min_score || 0;
    const domain = args.domain || "";
    let sql, params;
    if (domain) {
      sql = "SELECT id, url, title, domain, matchedRule, timestamp, pinned, score FROM records WHERE (title LIKE ? OR url LIKE ?) AND score >= ? AND matchedRule = ? ORDER BY timestamp DESC LIMIT ?";
      params = [`%${query}%`, `%${query}%`, minScore, domain, limit];
    } else {
      sql = "SELECT id, url, title, domain, matchedRule, timestamp, pinned, score FROM records WHERE (title LIKE ? OR url LIKE ?) AND score >= ? ORDER BY timestamp DESC LIMIT ?";
      params = [`%${query}%`, `%${query}%`, minScore, limit];
    }
    const rows = dbAll(sql, params);
    return { count: rows.length, records: rows };
  },
  get_record_details: (args) => {
    const row = dbGet("SELECT * FROM records WHERE id = ?", [args.id]);
    return row || { error: "Record not found" };
  },
  get_statistics: async () => {
    const total = dbGet("SELECT COUNT(*) as total FROM records").total;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = dbGet("SELECT COUNT(*) as count FROM records WHERE timestamp >= ?", [todayStart.getTime()]).count;
    const domainRows = dbAll("SELECT matchedRule, COUNT(*) as count FROM records GROUP BY matchedRule ORDER BY count DESC");
    const ruleToLabel = {};
    watchlist.forEach((w) => { ruleToLabel[w.domain] = w.label || w.domain; });
    const domainCounts = {};
    for (const r of domainRows) {
      const label = ruleToLabel[r.matchedRule] || r.matchedRule;
      domainCounts[label] = (domainCounts[label] || 0) + r.count;
    }
    let topDomain = null, topDomainCount = 0;
    for (const label in domainCounts) {
      if (!topDomain || domainCounts[label] > topDomainCount) {
        topDomain = label;
        topDomainCount = domainCounts[label];
      }
    }
    const sites = new Set(watchlist.map((w) => w.label || w.domain)).size;
    return { total, today, sites, enabled, domainCounts, topDomain, topDomainCount, watchlistCount: watchlist.length };
  },
  get_recommendations: (args) => {
    const status = args.status !== undefined ? args.status : 0;
    const limit = args.limit || 50;
    return dbAll("SELECT * FROM recommendations WHERE status = ? ORDER BY createdAt DESC LIMIT ?", [status, limit]);
  },
  get_watchlist: () => {
    return { watchlist, count: watchlist.length };
  },
  get_agent_profile: () => {
    return getAgentProfile(dbGet, dbRun);
  },
  delete_records: async (args) => {
    const ids = args.ids;
    if (!ids || ids.length === 0) return { error: "No IDs provided" };
    const placeholders = ids.map(() => "?").join(",");
    const deletedRecords = dbAll(`SELECT * FROM records WHERE id IN (${placeholders})`, ids);
    dbRun(`DELETE FROM records WHERE id IN (${placeholders})`, ids);
    broadcastToExtensions({ type: "recordsCleared" });
    if (deletedRecords.length > 0) {
      setImmediate(() => triggerReflectionOnDelete(deletedRecords));
    }
    return { deleted: deletedRecords.length, reason: args.reason || "" };
  },
  update_regex_rule: (args) => {
    const domain = args.domain;
    const regexFilter = args.regex_filter || "";
    const regexTarget = args.regex_target || "url";
    const idx = watchlist.findIndex((w) => w.domain === domain);
    if (idx === -1) return { error: "Domain not found in watchlist" };
    watchlist[idx].regexFilter = regexFilter;
    watchlist[idx].regexTarget = regexTarget;
    dbRun("UPDATE watchlist SET regexFilter = ?, regexTarget = ? WHERE domain = ?", [regexFilter, regexTarget, domain]);
    broadcastToExtensions({ type: "watchlistUpdated", watchlist });
    return { updated: domain, regex_filter: regexFilter, regex_target: regexTarget, reason: args.reason || "" };
  },
  update_record_score: (args) => {
    const id = args.id;
    const score = Math.max(0, Math.min(100, args.score || 0));
    dbRun("UPDATE records SET score = ?, updatedAt = ? WHERE id = ?", [score, Date.now(), id]);
    const record = dbGet("SELECT * FROM records WHERE id = ?", [id]);
    if (record) broadcastToExtensions({ type: "recordUpdated", record });
    return record ? { updated: id, score } : { error: "Record not found" };
  },
  add_record: (args) => {
    const now = Date.now();
    const record = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      url: args.url,
      title: args.title || "",
      domain: args.domain,
      matchedRule: args.matched_rule,
      tabId: 0,
      timestamp: now,
    };
    dbRun(
      "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, createdAt, updatedAt, favIconUrl, description, ogImage) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, '', '', '')",
      [record.id, record.url, record.title, record.domain, record.matchedRule, record.tabId, record.timestamp, now, now],
    );
    record.pinned = 1;
    record.score = 1;
    record.createdAt = now;
    record.updatedAt = now;
    broadcastToExtensions({ type: "recordAdded", record });
    return { added: record.id, url: args.url, reason: args.reason || "" };
  },
};

// ── Agent IPC Handlers ──

function broadcastPendingActions() {
  broadcastToExtensions({ type: "agentPendingUpdated", actions: pendingAgentActions });
}

ipcMain.handle("agent-get-pending", () => {
  return pendingAgentActions;
});

ipcMain.handle("agent-approve-actions", async (_, actionIds) => {
  const results = await executeApprovedActions(actionIds, toolHandlers, broadcastToExtensions);
  // Update the pending list
  const approvedIds = results.map((r) => r.action.id);
  pendingAgentActions = pendingAgentActions.filter((a) => !approvedIds.includes(a.id));
  broadcastPendingActions();
  return results;
});

ipcMain.handle("agent-dismiss-actions", (_, actionIds) => {
  pendingAgentActions = pendingAgentActions.filter((a) => !actionIds.includes(a.id));
  broadcastPendingActions();
  return { dismissed: actionIds.length };
});

ipcMain.handle("agent-get-profile", () => {
  return getAgentProfile(dbGet, dbRun);
});

ipcMain.handle("agent-auto-clean", async () => {
  try {
    const profile = getAgentProfile(dbGet, dbRun);
    const stats = await toolHandlers.get_statistics({});
    const watchlistData = toolHandlers.get_watchlist({});
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const sysMsg = `You are a browsing history cleaning assistant. Analyze the user's data and identify records that should be cleaned up. Consider three scenarios:
1. Dead domains: domains in watchlist that have no records in the last 7 days
2. Regex mismatches: records that exist under a group but don't match any active regex filter
3. Low-engagement: records that are not pinned, have score 0 or NULL, and were created more than 14 days ago

Suggest deletions by calling the delete_records tool for junk records, and update_regex_rule if filters need tightening.`;

    const userMsg = `Current statistics: ${JSON.stringify(stats)}\nWatchlist: ${JSON.stringify(watchlistData)}\nUser anti-patterns: ${JSON.stringify(profile.antiPatterns)}\n\nPlease scan the records and suggest cleanup actions.`;

    const messages = [
      { role: "system", content: sysMsg },
      { role: "user", content: userMsg },
    ];

    const { result, pendingActions } = await agentLoop(
      messages,
      aiConfig,
      callAIFns,
      toolHandlers,
      broadcastToExtensions,
    );

    if (pendingActions.length > 0) {
      pendingAgentActions.push(...pendingActions);
      broadcastPendingActions();
    }

    return { result, pendingActions };
  } catch (e) {
    console.error("Auto-clean error:", e);
    return { error: e.message };
  }
});

// ── Self-Reflection Triggers ──

async function triggerReflectionOnDelete(deletedRecords) {
  try {
    const profile = getAgentProfile(dbGet, dbRun);
    const keptSample = dbAll(
      "SELECT * FROM records WHERE pinned = 1 ORDER BY score DESC, timestamp DESC LIMIT 20",
    );
    const prompt = buildDeleteReflectionPrompt(deletedRecords, keptSample);
    const response = await callAI(prompt);
    const jsonStr = extractJson(response);
    if (jsonStr) {
      const reflection = JSON.parse(jsonStr);
      const updatedProfile = applyReflection(profile, reflection);
      saveAgentProfile(updatedProfile, dbRun);
    }
  } catch (e) {
    console.error("Reflection on delete error:", e);
  }
}

async function triggerReflectionOnReject(rejectedRec) {
  try {
    const profile = getAgentProfile(dbGet, dbRun);
    const keptSample = dbAll(
      "SELECT * FROM records WHERE pinned = 1 ORDER BY score DESC, timestamp DESC LIMIT 20",
    );
    const prompt = buildRejectReflectionPrompt(rejectedRec, keptSample);
    const response = await callAI(prompt);
    const jsonStr = extractJson(response);
    if (jsonStr) {
      const reflection = JSON.parse(jsonStr);
      const updatedProfile = applyReflection(profile, reflection);
      saveAgentProfile(updatedProfile, dbRun);
    }
  } catch (e) {
    console.error("Reflection on reject error:", e);
  }
}

function httpRequestJson(urlObj, method, headers, body, timeout) {
  const transport = urlObj.protocol === "https:" ? https : http;
  const urlStr = urlObj.toString();
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: Object.assign(
        {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        headers,
      ),
      timeout: timeout || 60000,
    };
    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(
            new Error(
              "HTTP " +
                res.statusCode +
                " → " +
                urlStr +
                " : " +
                data.slice(0, 200),
            ),
          );
          return;
        }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on("error", (e) => reject(new Error(e.message + " → " + urlStr)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(t("ai.error.httpTimeout") + " → " + urlStr));
    });
    req.write(body);
    req.end();
  });
}

function callOllama(prompt) {
  const url = new URL("/api/generate", aiConfig.endpoint.replace(/\/+$/, ""));

  function request(withFormat) {
    const body = { model: aiConfig.model, prompt, stream: false };
    if (withFormat) body.format = "json";
    return httpRequestJson(url, "POST", {}, JSON.stringify(body));
  }

  function parseResponse(data) {
    let result;
    try {
      result = JSON.parse(data);
    } catch (e) {
      console.error("Ollama: failed to parse response:", data.slice(0, 500));
      throw new Error(t("ai.error.ollamaNotJson"));
    }
    if (result.error)
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : JSON.stringify(result.error),
      );
    return result.response || data;
  }

  return request(true).then(
    ({ data }) => parseResponse(data),
    (err) => {
      if (err.message && err.message.includes("format")) {
        console.error("Ollama: format=json failed, retrying without format");
        return request(false).then(({ data }) => parseResponse(data));
      }
      throw err;
    },
  );
}

function callOpenAI(prompt) {
  const base = aiConfig.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = new URL(base + "/v1/chat/completions");
  const body = JSON.stringify({
    model: aiConfig.model,
    messages: [
      {
        role: "system",
        content:
          "You are a content recommendation expert. Always respond with valid JSON only, no markdown fences.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });
  return httpRequestJson(
    url,
    "POST",
    { Authorization: "Bearer " + aiConfig.apiKey },
    body,
  ).then(({ status, data }) => {
    let result;
    try {
      result = JSON.parse(data);
    } catch (e) {
      console.error(
        "OpenAI: failed to parse response, status:",
        status,
        data.slice(0, 500),
      );
      throw new Error(t("ai.error.openaiNotJson", { status: String(status) }));
    }
    if (result.error)
      throw new Error(result.error.message || JSON.stringify(result.error));
    if (!result.choices || !result.choices[0])
      throw new Error(t("ai.error.openaiNoChoices"));
    return result.choices[0].message.content;
  });
}

function callAnthropic(prompt) {
  const base = aiConfig.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = new URL(base + "/v1/messages");
  const body = JSON.stringify({
    model: aiConfig.model,
    max_tokens: 1024,
    system:
      "You are a content recommendation expert. Always respond with valid JSON only, no markdown fences.",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  });
  return httpRequestJson(
    url,
    "POST",
    { "x-api-key": aiConfig.apiKey, "anthropic-version": "2023-06-01" },
    body,
  ).then(({ status, data }) => {
    let result;
    try {
      result = JSON.parse(data);
    } catch (e) {
      console.error(
        "Anthropic: failed to parse response, status:",
        status,
        data.slice(0, 500),
      );
      throw new Error(t("ai.error.anthropicNotJson", { status: String(status) }));
    }
    if (result.error)
      throw new Error(result.error.message || JSON.stringify(result.error));
    if (result.content) {
      for (const block of result.content) {
        if (block.type === "text" && block.text != null) return block.text;
      }
    }
    throw new Error(t("ai.error.anthropicNoText"));
  });
}

function callAI(prompt) {
  switch (aiConfig.provider) {
    case "openai":
      return callOpenAI(prompt);
    case "anthropic":
    case "minimax":
      return callAnthropic(prompt);
    default:
      return callOllama(prompt);
  }
}

async function callOllamaTools(messages, tools) {
  const systemPrompt = `You are an intelligent browsing assistant with access to tools. You can call tools to search records, analyze statistics, and manage the user's watchlist. When you need to call a tool, respond with JSON in this format:

{ "tool_calls": [{ "id": "call_1", "function": { "name": "tool_name", "arguments": "{{...}}" } }], "content": "Your observation text" }

Available tools:
${JSON.stringify(tools, null, 2)}

When you are done and don't need more tools, respond with:
{ "content": "Your final response text" }

Always use valid JSON.`;

  const userContent = messages.map((m) => {
    if (m.role === "tool") return `[Tool result for ${m.tool_call_id}]: ${m.content}`;
    return `${m.role}: ${m.content || ""}`;
  }).join("\n\n");

  const prompt = `${systemPrompt}\n\n---\n\n${userContent}`;
  const response = await callOllama(prompt);
  try {
    const parsed = JSON.parse(response);
    return { content: parsed.content || "", tool_calls: parsed.tool_calls || [] };
  } catch (e) {
    return { content: response, tool_calls: [] };
  }
}

async function callOpenAITools(messages, tools) {
  const base = aiConfig.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = new URL(base + "/v1/chat/completions");
  const msgs = messages[0]?.role === "system"
    ? messages
    : [{ role: "system", content: "You are an intelligent browsing history assistant. Use tools to search records, analyze patterns, and manage the watchlist." }, ...messages];
  const body = JSON.stringify({
    model: aiConfig.model,
    messages: msgs,
    tools: tools,
    tool_choice: "auto",
    temperature: 0.7,
  });
  const { data } = await httpRequestJson(
    url,
    "POST",
    { Authorization: "Bearer " + aiConfig.apiKey },
    body,
  );
  let result;
  try {
    result = JSON.parse(data);
  } catch (e) {
    throw new Error(t("ai.error.openaiNotJson", { status: "tool_call" }));
  }
  if (result.error)
    throw new Error(result.error.message || JSON.stringify(result.error));
  const choice = result.choices?.[0];
  if (!choice) throw new Error(t("ai.error.openaiNoChoices"));
  const message = choice.message;
  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: tc.function?.arguments,
  }));
  return { content: message.content || "", tool_calls: toolCalls };
}

async function callAnthropicTools(messages, tools) {
  const base = aiConfig.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = new URL(base + "/v1/messages");
  const systemMsg = messages[0]?.role === "system" ? messages[0].content : "You are an intelligent browsing history assistant. Use tools to search records, analyze patterns, and manage the watchlist.";
  const conversationMsgs = messages[0]?.role === "system" ? messages.slice(1) : messages;
  const anthropicMessages = conversationMsgs.map((m) => {
    if (m.role === "tool") return { role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }] };
    if (m.role === "assistant" && m.tool_calls) {
      const blocks = m.tool_calls.map((tc) => ({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : tc.arguments,
      }));
      if (m.content) blocks.unshift({ type: "text", text: m.content });
      return { role: "assistant", content: blocks };
    }
    return { role: m.role, content: [{ type: "text", text: m.content || "" }] };
  });
  const body = JSON.stringify({
    model: aiConfig.model,
    max_tokens: 1024,
    system: systemMsg,
    messages: anthropicMessages,
    tools: tools,
  });
  const { data } = await httpRequestJson(
    url,
    "POST",
    { "x-api-key": aiConfig.apiKey, "anthropic-version": "2023-06-01" },
    body,
  );
  let result;
  try {
    result = JSON.parse(data);
  } catch (e) {
    throw new Error(t("ai.error.anthropicNotJson", { status: "tool_call" }));
  }
  if (result.error)
    throw new Error(result.error.message || JSON.stringify(result.error));
  const toolCalls = [];
  let textContent = "";
  if (result.content) {
    for (const block of result.content) {
      if (block.type === "text" && block.text != null) textContent += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        });
      }
    }
  }
  return { content: textContent, tool_calls: toolCalls };
}

async function callAITools(messages, tools) {
  const openaiTools = getOpenAITools();
  const anthropicTools = getAnthropicTools();
  const allTools = require("./agent/tools").getAllTools();

  switch (aiConfig.provider) {
    case "openai":
      return callOpenAITools(messages, openaiTools);
    case "anthropic":
    case "minimax":
      return callAnthropicTools(messages, anthropicTools);
    default:
      return callOllamaTools(messages, allTools);
  }
}

const callAIFns = {
  callOpenAIWithTools: (messages, tools) => callOpenAITools(messages, tools),
  callAnthropicWithTools: (messages, tools) => callAnthropicTools(messages, tools),
  callOllamaWithTools: (messages, tools) => callOllamaTools(messages, tools),
};

function extractHighValueRecords() {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let rows = dbAll(
    "SELECT * FROM records WHERE (pinned = 1 OR score > 0) AND timestamp >= ? ORDER BY score DESC, timestamp DESC LIMIT 50",
    [thirtyDaysAgo],
  );
  if (rows.length < 10) {
    rows = dbAll(
      "SELECT * FROM records WHERE timestamp >= ? ORDER BY pinned DESC, score DESC, timestamp DESC LIMIT 50",
      [thirtyDaysAgo],
    );
  }
  return rows;
}

function buildAnalysisPrompt(records) {
  const ruleToLabel = {};
  watchlist.forEach((w) => {
    ruleToLabel[w.domain] = w.label || w.domain;
  });

  const recordItems = records.map((r) => {
    const label = ruleToLabel[r.matchedRule] || r.matchedRule;
    const title = (r.title || "").slice(0, 80);
    const score = r.score || 0;
    const pinned = r.pinned ? "★" : "";
    return `- [${label}] ${title} (分数:${score} ${pinned})`;
  });

  const patterns = [];
  watchlist.forEach((w) => {
    if (w.regexFilter && w.regexFilter.trim()) {
      patterns.push(
        `  - ${w.label || w.domain}: ${w.regexFilter} (${w.regexTarget})`,
      );
    }
  });

  return (
    "你是一个私人的内容推荐专家。以下是我近期高分收藏的视频记录：\n" +
    recordItems.join("\n") +
    "\n\n" +
    (patterns.length > 0
      ? "我关注的内容模式（正则匹配规则）：\n" + patterns.join("\n") + "\n\n"
      : "") +
    "请执行以下任务：\n" +
    " 1. 用一句话总结我的内容偏好。\n" +
    " 2. 推测 5 个我目前还未看过，但极大概率会感兴趣的相关系列、标签或具体搜索关键词。\n" +
    '   请严格按照 JSON 格式返回结果：{ "summary": "...", "keywords": ["...", "..."] }'
  );
}

ipcMain.handle("get-locale", () => {
  return { code: localeCode, data: locale };
});

ipcMain.handle("set-locale", (_, code) => {
  localeCode = code;
  dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["locale", code]);
  const file = path.join(__dirname, "locales", code + ".json");
  try { locale = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) {
    try {
      const file2 = path.join(__dirname, "locales", "zh-CN.json");
      locale = JSON.parse(fs.readFileSync(file2, "utf8"));
    } catch (e2) { locale = {}; }
  }
});

ipcMain.handle("get-ai-config", () => {
  return {
    provider: aiConfig.provider,
    endpoint: aiConfig.endpoint,
    apiKey: aiConfig.apiKey ? "••••" + aiConfig.apiKey.slice(-4) : "",
    model: aiConfig.model,
  };
});

ipcMain.handle("set-ai-config", (_, config) => {
  if (config.provider !== undefined) {
    aiConfig.provider = config.provider;
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "ai.provider",
      config.provider,
    ]);
  }
  if (config.endpoint !== undefined) {
    aiConfig.endpoint = config.endpoint;
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "ai.endpoint",
      config.endpoint,
    ]);
  }
  if (config.apiKey !== undefined) {
    if (config.apiKey && !config.apiKey.startsWith("••••")) {
      aiConfig.apiKey = config.apiKey;
      dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
        "ai.apiKey",
        config.apiKey,
      ]);
    }
  }
  if (config.model !== undefined) {
    aiConfig.model = config.model;
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "ai.model",
      config.model,
    ]);
  }
});

function extractJson(text) {
  if (!text || typeof text !== "string") return null;
  // strip markdown code fences
  let s = text;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  // find the outermost balanced JSON object
  let start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  return s.slice(start, end + 1);
}

ipcMain.handle("trigger-agent-analysis", async () => {
  try {
    const records = extractHighValueRecords();
    if (records.length === 0) {
      return { error: t("ai.emptyRecords"), keywords: [], summary: "" };
    }
    const ruleToLabel = {};
    watchlist.forEach((w) => { ruleToLabel[w.domain] = w.label || w.domain; });

    const sysMsg = `You are a private content recommendation expert. You have access to tools to explore the user's browsing history. Use them to gain deeper insights.

First, call search_records to sample recent records across different domains.
Then call get_statistics to understand the distribution.
Finally, call get_agent_profile to incorporate past learnings.

After gathering data, produce a final analysis as a JSON object:
{ "summary": "One sentence summary of user preferences in the user's language", "keywords": ["keyword1", "keyword2", ...] }

Always respond in the same language as the user's records. Be concise.`;

    const recordSummary = records.slice(0, 10).map((r) => {
      const label = ruleToLabel[r.matchedRule] || r.matchedRule;
      return `[${label}] ${(r.title || "").slice(0, 80)} (score:${r.score || 0})`;
    }).join("\n");

    const userMsg = `User has ${records.length} high-value records. Sample:\n${recordSummary}\n\nAnalyze their preferences thoroughly using the available tools.`;

    const messages = [
      { role: "system", content: sysMsg },
      { role: "user", content: userMsg },
    ];

    const { result, pendingActions } = await agentLoop(
      messages,
      aiConfig,
      callAIFns,
      toolHandlers,
      broadcastToExtensions,
    );

    if (pendingActions.length > 0) {
      pendingAgentActions.push(...pendingActions);
      broadcastPendingActions();
    }

    const jsonStr = extractJson(result || "");
    let analysis = { summary: "", keywords: [] };
    if (jsonStr) {
      try { analysis = JSON.parse(jsonStr); } catch (e) {}
    }

    // Fallback: if no JSON found, use the raw result as summary
    if (!analysis.summary && result) {
      analysis.summary = result.slice(0, 200);
    }

    return {
      summary: analysis.summary || "",
      keywords: analysis.keywords || [],
      recordsAnalyzed: records.length,
      pendingActions: pendingActions.length,
    };
  } catch (e) {
    console.error("Agent analysis error:", e);
    return { error: t("ai.failed", { msg: e.message || e }) };
  }
});

ipcMain.handle("get-recommendations", () => {
  return dbAll(
    "SELECT * FROM recommendations ORDER BY createdAt DESC LIMIT 200",
  );
});

ipcMain.handle("reject-recommendation", (_, id) => {
  const rec = dbGet("SELECT * FROM recommendations WHERE id = ?", [id]);
  dbRun("UPDATE recommendations SET status = -1 WHERE id = ?", [id]);
  if (rec) {
    setImmediate(() => triggerReflectionOnReject(rec));
  }
  return true;
});

ipcMain.handle("accept-recommendation", (_, id) => {
  const rec = dbGet("SELECT * FROM recommendations WHERE id = ?", [id]);
  if (!rec) return false;
  dbRun("UPDATE recommendations SET status = 1 WHERE id = ?", [id]);
  const now = Date.now();
  const record = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    url: rec.url,
    title: rec.title,
    domain: rec.domain,
    matchedRule: rec.groupLabel,
    tabId: 0,
    timestamp: now,
  };
  dbRun(
    "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, createdAt, updatedAt, favIconUrl, description, ogImage) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, '', '', '')",
    [
      record.id,
      record.url,
      record.title,
      record.domain,
      record.matchedRule,
      record.tabId,
      record.timestamp,
      now,
      now,
    ],
  );
  broadcastToExtensions({ type: "recordAdded", record });
  return record;
});

ipcMain.handle("clear-recommendations", () => {
  dbRun("DELETE FROM recommendations");
  return true;
});

ipcMain.handle("test-ai-connection", async () => {
  try {
    const response = await callAI("回复一个字：好。Reply with one word: OK.");
    return { ok: true, response, provider: aiConfig.provider };
  } catch (e) {
    return { ok: false, error: e.message, provider: aiConfig.provider };
  }
});

module.exports = { app };
