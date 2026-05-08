const WS_URL = "ws://127.0.0.1:8766"
const RECONNECT_INTERVAL = 3000
const MAX_CACHED_RECORDS = 500

interface WatchlistEntry {
  domain: string
  label: string
  color: string
}

interface HistoryRecord {
  id: string
  url: string
  title: string
  domain: string | null
  matchedRule: string
  tabId: number
  timestamp: number
  pinned?: number
  score?: number | null
}

let ws: WebSocket | null = null
let watchlist: WatchlistEntry[] = []
let enabled = true
let records: HistoryRecord[] = []
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingMessages: unknown[] = []

function connect() {
  try {
    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log("[Tracker] WebSocket connected")
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      flushPending()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        handleMessage(msg)
      } catch (e) {
        console.error("[Tracker] Invalid message:", e)
      }
    }

    ws.onclose = () => {
      console.log("[Tracker] WebSocket disconnected, reconnecting...")
      scheduleReconnect()
    }

    ws.onerror = (err) => {
      console.error("[Tracker] WebSocket error:", err)
    }
  } catch (e) {
    console.error("[Tracker] Failed to connect:", e)
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL)
}

function send(msg: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  } else {
    pendingMessages.push(msg)
  }
}

function flushPending() {
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()!
    send(msg)
  }
}

interface WsMessage {
  type: string
  watchlist?: WatchlistEntry[]
  records?: HistoryRecord[]
  enabled?: boolean
  record?: HistoryRecord
}

function handleMessage(msg: WsMessage) {
  switch (msg.type) {
    case "init":
      watchlist = msg.watchlist || []
      enabled = msg.enabled !== false
      saveLocal()
      break
    case "watchlistUpdated":
      watchlist = msg.watchlist || []
      saveLocal()
      break
    case "enabledUpdated":
      enabled = !!msg.enabled
      saveLocal()
      break
    case "recordAdded":
      if (msg.record) {
        const exists = records.some((r) => r.id === msg.record!.id)
        if (!exists) {
          records.unshift(msg.record)
          if (records.length > MAX_CACHED_RECORDS) records.splice(MAX_CACHED_RECORDS)
          saveLocal()
        }
      }
      break
    case "recordsCleared":
      records = []
      saveLocal()
      break
    case "recordUpdated":
      if (msg.record) {
        const idx = records.findIndex((r) => r.id === msg.record!.id)
        if (idx !== -1) {
          records[idx] = msg.record
        } else {
          records.unshift(msg.record)
          if (records.length > MAX_CACHED_RECORDS) records.splice(MAX_CACHED_RECORDS)
        }
        saveLocal()
      }
      break
    case "stats":
      break
  }
}

async function saveLocal() {
  try {
    await chrome.storage.local.set({ watchlist, enabled, records })
  } catch (e) {
    // ignore
  }
}

async function loadLocal() {
  try {
    const result = await chrome.storage.local.get([
      "watchlist",
      "enabled",
      "records",
    ])
    watchlist = (result.watchlist as WatchlistEntry[]) || []
    enabled = result.enabled !== false
    records = (result.records as HistoryRecord[]) || []
  } catch (e) {
    watchlist = []
    enabled = true
    records = []
  }
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, "")
  } catch (e) {
    return null
  }
}

function matchesWatchlist(url: string): WatchlistEntry | null {
  const domain = extractDomain(url)
  if (!domain) return null
  for (const entry of watchlist) {
    const pattern = entry.domain
      .replace(/^www\./, "")
      .toLowerCase()
      .trim()
    if (domain === pattern || domain.endsWith("." + pattern)) {
      return entry
    }
  }
  return null
}

async function handleUrl(url: string, tabId: number, title: string) {
  if (!url) return
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("moz-extension://")
  )
    return

  if (!enabled) return
  if (watchlist.length === 0) return

  const matched = matchesWatchlist(url)
  if (!matched) return

  const now = Date.now()
  const isDuplicate = records.some(
    (r) => r.url === url && r.tabId === tabId && now - r.timestamp < 60000,
  )
  if (isDuplicate) return

  const record: HistoryRecord = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title: title || "",
    domain: extractDomain(url),
    matchedRule: matched.domain,
    tabId,
    timestamp: now,
  }

  records.unshift(record)
  if (records.length > MAX_CACHED_RECORDS) records.splice(MAX_CACHED_RECORDS)
  saveLocal()

  send({ type: "addRecord", ...record })
  console.log("[Tracker] Saved:", title || url)
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    handleUrl(tab.url, tabId, tab.title || "")
  }
})

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab.url) {
      handleUrl(tab.url, activeInfo.tabId, tab.title || "")
    }
  } catch (e) {
    // ignore
  }
})

chrome.runtime.onInstalled.addListener(async () => {
  await loadLocal()
  if (watchlist.length === 0) {
    watchlist = [{ domain: "bilibili.com", label: "B站", color: "#fb7299" }]
    saveLocal()
  }
  console.log("[Tracker] Extension installed")
  connect()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if ((msg as { type: string }).type === "GET_STATS") {
    const stats: Record<string, number> = {}
    for (const r of records) {
      stats[r.matchedRule] = (stats[r.matchedRule] || 0) + 1
    }
    sendResponse({ total: records.length, stats, enabled })
  } else if ((msg as { type: string }).type === "SYNC_WATCHLIST") {
    watchlist = (msg as { watchlist: WatchlistEntry[] }).watchlist
    saveLocal()
    send({ type: "updateWatchlist", watchlist })
  } else if ((msg as { type: string }).type === "SYNC_ENABLED") {
    enabled = (msg as { enabled: boolean }).enabled
    saveLocal()
    send({ type: "updateEnabled", enabled })
  } else if ((msg as { type: string }).type === "TOGGLE_RECORD_PIN") {
    const id = (msg as { id: string }).id
    const idx = records.findIndex((r) => r.id === id)
    if (idx !== -1) {
      const rec = records[idx]
      const newPinned = rec.pinned ? 0 : 1
      const newScore = newPinned && rec.score == null ? 50 : rec.score
      records[idx] = { ...rec, pinned: newPinned, score: newScore }
      saveLocal()
      send({ type: "recordUpdated", record: records[idx] })
    }
    sendResponse({ success: true })
  }
  return true
})

loadLocal().then(() => connect())
