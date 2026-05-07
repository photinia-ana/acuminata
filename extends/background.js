// background.js - Service Worker
// 通过 WebSocket 与桌面端通信，同时保持 chrome.storage.local 作为本地缓存

const WS_URL = "ws://127.0.0.1:8766";
const RECONNECT_INTERVAL = 3000;

let ws = null;
let watchlist = [];
let enabled = true;
let records = [];
let reconnectTimer = null;
let pendingMessages = [];

function connect() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("[Tracker] WebSocket connected");
      clearTimeout(reconnectTimer);
      flushPending();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error("[Tracker] Invalid message:", e);
      }
    };

    ws.onclose = () => {
      console.log("[Tracker] WebSocket disconnected, reconnecting...");
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error("[Tracker] WebSocket error:", err);
    };
  } catch (e) {
    console.error("[Tracker] Failed to connect:", e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL);
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    pendingMessages.push(msg);
  }
}

function flushPending() {
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift();
    send(msg);
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case "init":
      watchlist = msg.watchlist || [];
      records = msg.records || [];
      enabled = msg.enabled !== false;
      saveLocal();
      break;
    case "watchlistUpdated":
      watchlist = msg.watchlist || [];
      saveLocal();
      break;
    case "enabledUpdated":
      enabled = msg.enabled;
      saveLocal();
      break;
    case "recordAdded":
      const exists = records.some((r) => r.id === msg.record.id);
      if (!exists) {
        records.unshift(msg.record);
        if (records.length > 10000) records.splice(10000);
        saveLocal();
      }
      break;
    case "recordsCleared":
      records = [];
      saveLocal();
      break;
    case "stats":
      break;
  }
}

async function saveLocal() {
  try {
    await chrome.storage.local.set({ watchlist, enabled, records });
  } catch (e) {}
}

async function loadLocal() {
  try {
    const result = await chrome.storage.local.get([
      "watchlist",
      "enabled",
      "records",
    ]);
    watchlist = result.watchlist || [];
    enabled = result.enabled !== false;
    records = result.records || [];
  } catch (e) {
    watchlist = [];
    enabled = true;
    records = [];
  }
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch (e) {
    return null;
  }
}

function matchesWatchlist(url) {
  const domain = extractDomain(url);
  if (!domain) return null;
  for (const entry of watchlist) {
    const pattern = entry.domain
      .replace(/^www\./, "")
      .toLowerCase()
      .trim();
    if (domain === pattern || domain.endsWith("." + pattern)) {
      return entry;
    }
  }
  return null;
}

async function handleUrl(url, tabId, title) {
  if (!url) return;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://"))
    return;
  if (url.startsWith("moz-extension://")) return;

  if (!enabled) return;
  if (watchlist.length === 0) return;

  const matched = matchesWatchlist(url);
  if (!matched) return;

  const now = Date.now();
  const isDuplicate = records.some(
    (r) => r.url === url && r.tabId === tabId && now - r.timestamp < 60000,
  );
  if (isDuplicate) return;

  const record = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title: title || "",
    domain: extractDomain(url),
    matchedRule: matched.domain,
    tabId,
    timestamp: now,
  };

  records.unshift(record);
  if (records.length > 10000) records.splice(10000);
  saveLocal();

  send({ type: "addRecord", ...record });
  console.log("[Tracker] Saved:", title || url);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    handleUrl(tab.url, tabId, tab.title);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      handleUrl(tab.url, activeInfo.tabId, tab.title);
    }
  } catch (e) {}
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadLocal();
  if (watchlist.length === 0) {
    watchlist = [{ domain: "bilibili.com", label: "B站", color: "#fb7299" }];
    saveLocal();
  }
  console.log("[Tracker] Extension installed");
  connect();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_STATS") {
    const stats = {};
    for (const r of records) {
      stats[r.matchedRule] = (stats[r.matchedRule] || 0) + 1;
    }
    sendResponse({ total: records.length, stats, enabled });
  } else if (msg.type === "SYNC_WATCHLIST") {
    watchlist = msg.watchlist;
    saveLocal();
  }
  return true;
});

loadLocal().then(() => connect());
