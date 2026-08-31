// RecordStore — deep module encapsulating all SQLite persistence.
// No IPC, no WebSocket, no Electron. Pure domain logic + sql.js.

const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const {
  buildAnalysisPrompt,
  buildDeleteReflectionPrompt,
  buildRejectReflectionPrompt,
} = require("./prompts");

function uuid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return Date.now();
}

// ── Constructor ──────────────────────────────────────────────────────────────

class RecordStore {
  /**
   * @param {string} dbPath
   * @param {Function} [broadcast] - (type, payload) => void
   */
  constructor(dbPath, broadcast) {
    this.dbPath = dbPath;
    this.broadcast = broadcast || (() => {});
    this.db = null;
    this._watchers = [];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async init() {
    const SQL = await initSqlJs();
    try {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } catch (e) {
      this.db = new SQL.Database();
    }
    this._migrate();
    this._seedDefaults();
  }

  _migrate() {
    // Core tables
    this.db.run(`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL,
      matchedRule TEXT NOT NULL,
      tabId INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    )`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_records_ts ON records(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_records_mr ON records(matchedRule)`);
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_records_dedup ON records(url, tabId, timestamp)`,
    );

    // Migrations
    const cols = [
      "pinned INTEGER DEFAULT 0",
      "score INTEGER DEFAULT NULL",
      "createdAt INTEGER DEFAULT NULL",
      "updatedAt INTEGER DEFAULT NULL",
      "favIconUrl TEXT DEFAULT ''",
      "description TEXT DEFAULT ''",
      "ogImage TEXT DEFAULT ''",
      "dwellTime INTEGER DEFAULT 0",
    ];
    for (const col of cols) {
      try { this.db.run(`ALTER TABLE records ADD COLUMN ${col}`); } catch (e) {}
    }

    this.db.run(`CREATE TABLE IF NOT EXISTS watchlist (
      domain TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#5b8dee'
    )`);
    try { this.db.run("ALTER TABLE watchlist ADD COLUMN regexFilter TEXT DEFAULT ''"); } catch (e) {}
    try { this.db.run("ALTER TABLE watchlist ADD COLUMN regexTarget TEXT DEFAULT 'url'"); } catch (e) {}

    this.db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      domain TEXT NOT NULL,
      groupLabel TEXT NOT NULL,
      reason TEXT,
      status INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'analysis',
      summary TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      completed_at INTEGER DEFAULT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      round INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL,
      content TEXT DEFAULT '',
      tool_calls TEXT DEFAULT NULL,
      tool_call_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    )`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_am_conv ON agent_messages(conversation_id)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      key TEXT DEFAULT '',
      value TEXT DEFAULT '',
      weight REAL DEFAULT 0.5,
      source_conversation_id TEXT,
      source_reflection TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_amm_type ON agent_memories(type)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS agent_pending_actions (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '{}',
      reason TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER DEFAULT NULL
    )`);
    try { this.db.run("DELETE FROM settings WHERE key = 'agent.profile'"); } catch (e) {}
  }

  _seedDefaults() {
    const count = this._dbGetScalar("SELECT COUNT(*) as c FROM watchlist");
    if (count === 0) {
      this.addWatchlist({
        domain: "bilibili.com",
        label: "B站",
        color: "#fb7299",
      });
    }
  }

  _emit(type, payload) {
    this.broadcast(type, payload);
  }

  // ── Low-level helpers ──────────────────────────────────────────────────────

  _dbAll(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  _dbGet(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
  }

  _dbRun(sql, params = []) {
    this.db.run(sql, params);
    this._markDirty();
  }

  _dbGetScalar(sql, params = []) {
    const row = this._dbGet(sql, params);
    if (!row) return null;
    const key = Object.keys(row)[0];
    return row[key];
  }

  _markDirty() {
    // In the real Electron app, this triggers debounced fs write.
    // The store owns the buffer; the caller decides when to export.
    if (this._onDirty) this._onDirty();
  }

  onDirty(fn) {
    this._onDirty = fn;
  }

  export() {
    return this.db.export();
  }

  // ── Watchlist ──────────────────────────────────────────────────────────────

  getWatchlist() {
    return this._dbAll("SELECT * FROM watchlist");
  }

  addWatchlist(entry) {
    const exists = this._dbGet(
      "SELECT domain FROM watchlist WHERE domain = ?",
      [entry.domain],
    );
    if (exists) return false;
    this._dbRun(
      "INSERT INTO watchlist (domain, label, color, regexFilter, regexTarget) VALUES (?, ?, ?, ?, ?)",
      [
        entry.domain,
        entry.label || "",
        entry.color || "#5b8dee",
        entry.regexFilter || "",
        entry.regexTarget || "url",
      ],
    );
    this._emit("watchlistUpdated", this.getWatchlist());
    return true;
  }

  removeWatchlist(domain) {
    const exists = this._dbGet(
      "SELECT domain FROM watchlist WHERE domain = ?",
      [domain],
    );
    if (!exists) return false;
    this._dbRun("DELETE FROM watchlist WHERE domain = ?", [domain]);
    this._emit("watchlistUpdated", this.getWatchlist());
    return true;
  }

  updateWatchlist(entries) {
    this._dbRun("DELETE FROM watchlist");
    const stmt = this.db.prepare(
      "INSERT INTO watchlist (domain, label, color, regexFilter, regexTarget) VALUES (?, ?, ?, ?, ?)",
    );
    for (const entry of entries) {
      stmt.bind([
        entry.domain,
        entry.label || "",
        entry.color || "#5b8dee",
        entry.regexFilter || "",
        entry.regexTarget || "url",
      ]);
      stmt.step();
      stmt.reset();
    }
    stmt.free();
    this._emit("watchlistUpdated", this.getWatchlist());
  }

  // ── Enabled ────────────────────────────────────────────────────────────────

  getEnabled() {
    const row = this._dbGet(
      "SELECT value FROM settings WHERE key = ?",
      ["enabled"],
    );
    return row ? row.value === "true" : true;
  }

  setEnabled(val) {
    this._dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ["enabled", String(val)],
    );
    this._emit("enabledUpdated", val);
  }

  // ── Locale ────────────────────────────────────────────────────────────────

  getLocale() {
    const row = this._dbGet("SELECT value FROM settings WHERE key = ?", ["locale"]);
    const code = row ? row.value : "zh-CN";
    let data = {};
    try {
      const file = path.join(__dirname, "..", "locales", code + ".json");
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      try {
        const file = path.join(__dirname, "..", "locales", "zh-CN.json");
        data = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e2) {}
    }
    return { code, data };
  }

  setLocale(code) {
    this._dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ["locale", code],
    );
  }

  // ── AI Config ─────────────────────────────────────────────────────────────

  getAIConfig() {
    const pick = (k) => {
      const row = this._dbGet("SELECT value FROM settings WHERE key = ?", [k]);
      return row ? row.value : null;
    };
    return {
      provider: pick("ai.provider") || "ollama",
      endpoint: pick("ai.endpoint") || "http://127.0.0.1:11434",
      apiKey: pick("ai.apiKey") || "",
      model: pick("ai.model") || "qwen2.5:7b",
    };
  }

  setAIConfig(config) {
    if (config.provider !== undefined)
      this._dbRun(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["ai.provider", config.provider],
      );
    if (config.endpoint !== undefined)
      this._dbRun(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["ai.endpoint", config.endpoint],
      );
    if (config.apiKey !== undefined)
      this._dbRun(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["ai.apiKey", config.apiKey],
      );
    if (config.model !== undefined)
      this._dbRun(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["ai.model", config.model],
      );
  }

  // ── Window Bounds ──────────────────────────────────────────────────────────

  getWindowBounds() {
    const x = this._dbGet("SELECT value FROM settings WHERE key = 'window.x'");
    const y = this._dbGet("SELECT value FROM settings WHERE key = 'window.y'");
    const w = this._dbGet("SELECT value FROM settings WHERE key = 'window.width'");
    const h = this._dbGet("SELECT value FROM settings WHERE key = 'window.height'");
    if (x && y && w && h) {
      return {
        x: parseInt(x.value, 10),
        y: parseInt(y.value, 10),
        width: parseInt(w.value, 10),
        height: parseInt(h.value, 10),
      };
    }
    return null;
  }

  saveWindowBounds(bounds) {
    const set = (k, v) =>
      this._dbRun(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [k, String(v)],
      );
    set("window.x", bounds.x);
    set("window.y", bounds.y);
    set("window.width", bounds.width);
    set("window.height", bounds.height);
  }

  // ── Records ────────────────────────────────────────────────────────────────

  getRecordById(id) {
    return this._dbGet("SELECT * FROM records WHERE id = ?", [id]);
  }

  getRecordsPage(page, pageSize, filter) {
    const offset = (page - 1) * pageSize;
    let countSql = "SELECT COUNT(*) as total FROM records";
    let dataSql = "SELECT * FROM records ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    let params = [pageSize, offset];
    let countParams = [];

    if (filter === "pinned") {
      countSql = "SELECT COUNT(*) as total FROM records WHERE pinned = 1";
      dataSql = "SELECT * FROM records WHERE pinned = 1 ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      countParams = [];
      params = [pageSize, offset];
    } else if (filter && filter !== "all") {
      const watchlist = this.getWatchlist();
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

    const total = this._dbGet(countSql, countParams).total;
    const records = this._dbAll(dataSql, params);
    return { records, total, page, pageSize };
  }

  getAllRecords() {
    return this._dbAll("SELECT * FROM records ORDER BY timestamp DESC");
  }

  getStats() {
    const total = this._dbGet("SELECT COUNT(*) as total FROM records").total;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = this._dbGet(
      "SELECT COUNT(*) as count FROM records WHERE timestamp >= ?",
      [todayStart.getTime()],
    ).count;

    const domainRows = this._dbAll(
      "SELECT matchedRule, COUNT(*) as count FROM records GROUP BY matchedRule ORDER BY count DESC",
    );

    const watchlist = this.getWatchlist();
    const ruleToLabel = {};
    watchlist.forEach((w) => {
      ruleToLabel[w.domain] = w.label || w.domain;
    });

    const domainCounts = {};
    let topDomain = null;
    let topDomainCount = 0;

    for (const r of domainRows) {
      const label = ruleToLabel[r.matchedRule] || r.matchedRule;
      domainCounts[label] = (domainCounts[label] || 0) + r.count;
      if (!topDomain || domainCounts[label] > topDomainCount) {
        topDomain = label;
        topDomainCount = domainCounts[label];
      }
    }

    const uniqueSites = new Set(
      watchlist.map((w) => w.label || w.domain),
    ).size;

    return { total, today, sites: uniqueSites, enabled: this.getEnabled(), domainCounts, topDomain, topDomainCount };
  }

  searchRecords(query, limit = 50, minScore = 0, domain = "") {
    const q = `%${query}%`;
    let sql, params;
    if (domain) {
      sql =
        "SELECT id, url, title, domain, matchedRule, timestamp, pinned, score FROM records WHERE (title LIKE ? OR url LIKE ?) AND score >= ? AND matchedRule = ? ORDER BY timestamp DESC LIMIT ?";
      params = [q, q, minScore, domain, Math.min(limit, 200)];
    } else {
      sql =
        "SELECT id, url, title, domain, matchedRule, timestamp, pinned, score FROM records WHERE (title LIKE ? OR url LIKE ?) AND score >= ? ORDER BY timestamp DESC LIMIT ?";
      params = [q, q, minScore, Math.min(limit, 200)];
    }
    return this._dbAll(sql, params);
  }

  insertRecord(record) {
    const nowTs = now();
    this._dbRun(
      "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, createdAt, updatedAt, favIconUrl, description, ogImage) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?, ?)",
      [
        record.id,
        record.url,
        record.title || "",
        record.domain,
        record.matchedRule,
        record.tabId || 0,
        record.timestamp || nowTs,
        nowTs,
        record.favIconUrl || "",
        record.description || "",
        record.ogImage || "",
      ],
    );
    const full = this.getRecordById(record.id);
    this._emit("recordAdded", full);
    return full;
  }

  updateRecord(id, updates) {
    const sets = [];
    const params = [];
    for (const [key, val] of Object.entries(updates)) {
      sets.push(`${key} = ?`);
      params.push(val);
    }
    params.push(id);
    this._dbRun(`UPDATE records SET ${sets.join(", ")} WHERE id = ?`, params);
    const record = this.getRecordById(id);
    if (record) this._emit("recordUpdated", record);
    return record;
  }

  deleteRecords(ids) {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const deleted = this._dbAll(`SELECT * FROM records WHERE id IN (${placeholders})`, ids);
    this._dbRun(`DELETE FROM records WHERE id IN (${placeholders})`, ids);
    this._emit("recordsCleared");
    return { deletedCount: deleted.length, deletedRecords: deleted };
  }

  toggleRecordPin(id, pinned, score) {
    this._dbRun(
      "UPDATE records SET pinned = ?, score = ?, updatedAt = ? WHERE id = ?",
      [pinned ? 1 : 0, score, now(), id],
    );
    const record = this.getRecordById(id);
    if (record) this._emit("recordUpdated", record);
    return record;
  }

  clearRecords() {
    this._dbRun("DELETE FROM records");
    this._emit("recordsCleared");
  }

  // ── Recommendations ────────────────────────────────────────────────────────

  getRecommendations(limit = 200) {
    return this._dbAll(
      "SELECT * FROM recommendations ORDER BY createdAt DESC LIMIT ?",
      [limit],
    );
  }

  rejectRecommendation(id) {
    const rec = this._dbGet("SELECT * FROM recommendations WHERE id = ?", [id]);
    this._dbRun("UPDATE recommendations SET status = -1 WHERE id = ?", [id]);
    return rec;
  }

  acceptRecommendation(id) {
    const rec = this._dbGet("SELECT * FROM recommendations WHERE id = ?", [id]);
    if (!rec) return null;
    this._dbRun("UPDATE recommendations SET status = 1 WHERE id = ?", [id]);
    const nowTs = now();
    const record = {
      id: `${nowTs}-${Math.random().toString(36).slice(2, 8)}`,
      url: rec.url,
      title: rec.title,
      domain: rec.domain,
      matchedRule: rec.groupLabel,
      tabId: 0,
      timestamp: nowTs,
    };
    this._dbRun(
      "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, createdAt, updatedAt, favIconUrl, description, ogImage) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, '', '', '')",
      [
        record.id,
        record.url,
        record.title,
        record.domain,
        record.matchedRule,
        record.tabId,
        record.timestamp,
        nowTs,
        nowTs,
      ],
    );
    const full = this.getRecordById(record.id);
    this._emit("recordAdded", full);
    return full;
  }

  clearRecommendations() {
    this._dbRun("DELETE FROM recommendations");
    return true;
  }

  // ── Agent Conversations ────────────────────────────────────────────────────

  createConversation(type, systemPrompt) {
    const id = uuid();
    this._dbRun(
      "INSERT INTO agent_conversations (id, type, system_prompt, created_at) VALUES (?, ?, ?, ?)",
      [id, type, systemPrompt || "", now()],
    );
    return id;
  }

  completeConversation(id, summary) {
    this._dbRun(
      "UPDATE agent_conversations SET summary = ?, completed_at = ? WHERE id = ?",
      [summary || "", now(), id],
    );
  }

  insertMessage(conversationId, round, role, content, toolCalls, toolCallId) {
    const id = uuid();
    this._dbRun(
      "INSERT INTO agent_messages (id, conversation_id, round, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        conversationId,
        round,
        role,
        content || "",
        toolCalls ? JSON.stringify(toolCalls) : null,
        toolCallId || null,
        now(),
      ],
    );
  }

  // ── Agent Memories ─────────────────────────────────────────────────────────

  upsertMemory(type, key, value, weight, sourceConvId, sourceReflection) {
    const existing = this._dbGet(
      "SELECT id, weight FROM agent_memories WHERE type = ? AND key = ?",
      [type, key],
    );
    const nowTs = now();
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);

    if (existing) {
      const newWeight = Math.min(1, Math.max(0, existing.weight * 0.7 + weight * 0.3));
      this._dbRun(
        "UPDATE agent_memories SET value = ?, weight = ?, updated_at = ?, source_reflection = ? WHERE id = ?",
        [stringValue, newWeight, nowTs, sourceReflection || null, existing.id],
      );
    } else {
      this._dbRun(
        "INSERT INTO agent_memories (id, type, key, value, weight, source_conversation_id, source_reflection, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          uuid(),
          type,
          key,
          stringValue,
          weight,
          sourceConvId || null,
          sourceReflection || null,
          nowTs,
          nowTs,
        ],
      );
    }
  }

  getMemoriesByType(type) {
    return this._dbAll(
      "SELECT * FROM agent_memories WHERE type = ? ORDER BY weight DESC",
      [type],
    );
  }

  getAllMemories() {
    return this._dbAll("SELECT * FROM agent_memories ORDER BY updated_at DESC");
  }

  buildAgentProfile() {
    const memories = this.getAllMemories();
    const profile = {
      preferences: memories
        .filter((m) => m.type === "preference")
        .map((m) => ({ key: m.key, weight: m.weight, value: m.value })),
      antiPatterns: memories
        .filter((m) => m.type === "anti_pattern")
        .map((m) => m.key),
      insights: memories
        .filter((m) => m.type === "insight")
        .map((m) => ({ key: m.key, value: m.value, weight: m.weight })),
      domainHealth: {},
      lastUpdated:
        memories.length > 0
          ? Math.max(...memories.map((m) => m.updated_at || 0))
          : null,
    };
    for (const m of memories.filter((m) => m.type === "domain_health")) {
      profile.domainHealth[m.key] = m.weight;
    }
    return profile;
  }

  // ── Pending Actions ────────────────────────────────────────────────────────

  insertPendingAction(conversationId, toolName, args) {
    const id = uuid();
    this._dbRun(
      "INSERT INTO agent_pending_actions (id, conversation_id, tool_name, args, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, conversationId, toolName, JSON.stringify(args), now()],
    );
    return id;
  }

  getPendingActions() {
    return this._dbAll(
      "SELECT * FROM agent_pending_actions WHERE status = 'pending' ORDER BY created_at ASC",
    );
  }

  resolvePendingAction(id, status) {
    this._dbRun(
      "UPDATE agent_pending_actions SET status = ?, resolved_at = ? WHERE id = ?",
      [status, now(), id],
    );
  }

  // ── AI Analysis Helpers ────────────────────────────────────────────────────

  extractHighValueRecords() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let rows = this._dbAll(
      "SELECT * FROM records WHERE (pinned = 1 OR score > 0) AND timestamp >= ? ORDER BY score DESC, timestamp DESC LIMIT 50",
      [thirtyDaysAgo],
    );
    if (rows.length < 10) {
      rows = this._dbAll(
        "SELECT * FROM records WHERE timestamp >= ? ORDER BY pinned DESC, score DESC, timestamp DESC LIMIT 50",
        [thirtyDaysAgo],
      );
    }
    return rows;
  }

  buildAnalysisPromptForRecords(records, watchlist) {
    return buildAnalysisPrompt(records, watchlist);
  }

  buildDeleteReflectionPrompt(deletedRecords) {
    const keptSample = this._dbAll(
      "SELECT * FROM records WHERE pinned = 1 ORDER BY score DESC, timestamp DESC LIMIT 20",
    );
    return buildDeleteReflectionPrompt(deletedRecords, keptSample);
  }

  buildRejectReflectionPrompt(rejectedRec) {
    const keptSample = this._dbAll(
      "SELECT * FROM records WHERE pinned = 1 ORDER BY score DESC, timestamp DESC LIMIT 20",
    );
    return buildRejectReflectionPrompt(rejectedRec, keptSample);
  }

  // ── Read-only agent view ───────────────────────────────────────────────────

  getAgentReadStore() {
    const self = this;
    return {
      searchRecords(query, limit, minScore, domain) {
        return self.searchRecords(query, limit, minScore, domain);
      },
      getRecordDetails(id) {
        return self.getRecordById(id);
      },
      getStatistics() {
        return self.getStats();
      },
      getRecommendations(status, limit) {
        const where = status !== undefined ? "WHERE status = ?" : "";
        const params = status !== undefined ? [status] : [];
        const sql = `SELECT * FROM recommendations ${where} ORDER BY createdAt DESC LIMIT ?`;
        const p = status !== undefined ? [...params, limit] : [limit];
        return self._dbAll(sql, p);
      },
      getWatchlist() {
        return self.getWatchlist();
      },
      getAgentProfile() {
        return self.buildAgentProfile();
      },
    };
  }
}

module.exports = { RecordStore };
