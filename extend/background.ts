const WS_URL = "ws://127.0.0.1:8766"
const RECONNECT_INTERVAL = 3000
const MAX_CACHED_RECORDS = 500

type Mode = "ws" | "local"

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
  favIconUrl?: string
  description?: string
  ogImage?: string
  dwellTime?: number
}

let ws: WebSocket | null = null
let watchlist: WatchlistEntry[] = []
let enabled = true
let records: HistoryRecord[] = []
let mode: Mode = "ws"
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingMessages: unknown[] = []
const tabEntryTimes: Record<number, number> = {}
const tabLastRecordId: Record<number, string> = {}

let aiProvider = "ollama"
let aiEndpoint = "http://127.0.0.1:11434"
let aiApiKey = ""
let aiModel = "qwen2.5:7b"

function connect() {
  if (mode !== "ws") return
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
  if (mode !== "ws") return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL)
}

function send(msg: unknown) {
  if (mode !== "ws") return
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
    await chrome.storage.local.set({ watchlist, enabled, records, mode, aiProvider, aiEndpoint, aiApiKey, aiModel })
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
      "mode",
      "aiProvider",
      "aiEndpoint",
      "aiApiKey",
      "aiModel",
    ])
    watchlist = (result.watchlist as WatchlistEntry[]) || []
    enabled = result.enabled !== false
    records = (result.records as HistoryRecord[]) || []
    mode = (result.mode as Mode) || "ws"
    aiProvider = (result.aiProvider as string) || "ollama"
    aiEndpoint = (result.aiEndpoint as string) || "http://127.0.0.1:11434"
    aiApiKey = (result.aiApiKey as string) || ""
    aiModel = (result.aiModel as string) || "qwen2.5:7b"
  } catch (e) {
    watchlist = []
    enabled = true
    records = []
    mode = "ws"
    aiProvider = "ollama"
    aiEndpoint = "http://127.0.0.1:11434"
    aiApiKey = ""
    aiModel = "qwen2.5:7b"
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

async function handleUrl(url: string, tabId: number, title: string, favIconUrl?: string) {
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

  tabEntryTimes[tabId] = now

  const record: HistoryRecord = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title: title || "",
    domain: extractDomain(url),
    matchedRule: matched.domain,
    tabId,
    timestamp: now,
    favIconUrl: favIconUrl || "",
  }

  records.unshift(record)
  if (records.length > MAX_CACHED_RECORDS) records.splice(MAX_CACHED_RECORDS)
  tabLastRecordId[tabId] = record.id
  saveLocal()

  if (mode === "ws") send({ type: "addRecord", ...record })
  console.log("[Tracker] Saved:", title || url)

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const desc = document.querySelector('meta[name="description"]')?.getAttribute("content") || ""
        const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || ""
        return { description: desc, ogImage: ogImg }
      },
      injectImmediately: false,
    })
    if (results?.[0]?.result) {
      const { description, ogImage } = results[0].result as { description: string; ogImage: string }
      record.description = description
      record.ogImage = ogImage
      const idx = records.findIndex((r) => r.id === record.id)
      if (idx !== -1) {
        records[idx] = record
        saveLocal()
        if (mode === "ws") send({ type: "recordUpdated", record })
      }
    }
  } catch (e) {
    // ignore — can't inject on chrome:// or restricted pages
  }
}

function flushDwellTime(tabId: number) {
  const start = tabEntryTimes[tabId]
  const recordId = tabLastRecordId[tabId]
  if (!start || !recordId) return
  const dwellTime = Date.now() - start
  if (dwellTime < 1000) return
  const idx = records.findIndex((r) => r.id === recordId)
  if (idx !== -1) {
    records[idx] = { ...records[idx], dwellTime }
    saveLocal()
    if (mode === "ws") send({ type: "recordUpdated", record: records[idx] })
  }
  delete tabEntryTimes[tabId]
  delete tabLastRecordId[tabId]
}

async function httpPostJson(url: string, headers: Record<string, string>, body: string, timeout = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    return text
  } finally {
    clearTimeout(timer)
  }
}

function extractJson(text: string): string | null {
  if (!text) return null
  let s = text
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1]
  const start = s.indexOf("{")
  if (start === -1) return null
  let depth = 0, inString = false, escape = false, end = -1
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (escape) { escape = false; continue }
    if (ch === "\\" && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === "{") depth++
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return null
  return s.slice(start, end + 1)
}

async function callOllamaLite(prompt: string, config: { endpoint: string; model: string }) {
  const url = config.endpoint.replace(/\/+$/, "") + "/api/generate"
  const body = JSON.stringify({ model: config.model, prompt, stream: false, format: "json" })
  try {
    const data = await httpPostJson(url, {}, body)
    const parsed = JSON.parse(data)
    return parsed.response || data
  } catch (e) {
    const retryBody = JSON.stringify({ model: config.model, prompt, stream: false })
    const retryData = await httpPostJson(url, {}, retryBody)
    const parsed = JSON.parse(retryData)
    return parsed.response || retryData
  }
}

async function callOpenAILite(prompt: string, config: { endpoint: string; apiKey: string; model: string }) {
  const base = config.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "")
  const url = base + "/v1/chat/completions"
  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: "system", content: "You are a browsing history analyst. Always respond with valid JSON only, no markdown fences." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  })
  const headers: Record<string, string> = {}
  if (config.apiKey) headers["Authorization"] = "Bearer " + config.apiKey
  const data = await httpPostJson(url, headers, body)
  const parsed = JSON.parse(data)
  if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error))
  return parsed.choices?.[0]?.message?.content || data
}

async function callAnthropicLite(prompt: string, config: { endpoint: string; apiKey: string; model: string }) {
  const base = config.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "")
  const url = base + "/v1/messages"
  const body = JSON.stringify({
    model: config.model,
    max_tokens: 1024,
    system: "You are a browsing history analyst. Always respond with valid JSON only, no markdown fences.",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  })
  const headers: Record<string, string> = { "anthropic-version": "2023-06-01" }
  if (config.apiKey) headers["x-api-key"] = config.apiKey
  const data = await httpPostJson(url, headers, body)
  const parsed = JSON.parse(data)
  if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error))
  for (const block of parsed.content || []) {
    if (block.type === "text") return block.text
  }
  return data
}

async function callAILite(prompt: string) {
  switch (aiProvider) {
    case "openai":
      return callOpenAILite(prompt, { endpoint: aiEndpoint, apiKey: aiApiKey, model: aiModel })
    case "anthropic":
      return callAnthropicLite(prompt, { endpoint: aiEndpoint, apiKey: aiApiKey, model: aiModel })
    default:
      return callOllamaLite(prompt, { endpoint: aiEndpoint, model: aiModel })
  }
}

function buildAnalysisPrompt(recs: HistoryRecord[], wl: WatchlistEntry[]) {
  const ruleToLabel: Record<string, string> = {}
  wl.forEach((w) => { ruleToLabel[w.domain] = w.label || w.domain })
  const lines = recs.slice(0, 100).map((r) => {
    const label = ruleToLabel[r.matchedRule] || r.matchedRule
    const title = (r.title || "").slice(0, 60)
    return `[${label}] ${title}`
  })
  return `你是一个浏览历史分析助手。分析以下记录，总结用户的浏览偏好。

记录格式: [域名] 标题

记录列表:
${lines.join("\n")}

请严格按照 JSON 格式返回，不要加 markdown 代码块标记：
{"summary": "用中文一句话总结用户的浏览偏好", "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]}`
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    handleUrl(tab.url, tabId, tab.title || "", tab.favIconUrl || "")
  }
})

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const prevTabId = Object.keys(tabEntryTimes).map(Number).find((t) => t !== activeInfo.tabId)
  if (prevTabId) flushDwellTime(prevTabId)
  tabEntryTimes[activeInfo.tabId] = Date.now()
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab.url) {
      handleUrl(tab.url, activeInfo.tabId, tab.title || "", tab.favIconUrl || "")
    }
  } catch (e) {
    // ignore
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  flushDwellTime(tabId)
})

chrome.runtime.onInstalled.addListener(async () => {
  await loadLocal()
  if (watchlist.length === 0) {
    watchlist = [{ domain: "bilibili.com", label: "B站", color: "#fb7299" }]
    saveLocal()
  }
  console.log("[Tracker] Extension installed")
  if (mode === "ws") connect()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if ((msg as { type: string }).type === "GET_STATS") {
    const stats: Record<string, number> = {}
    for (const r of records) {
      stats[r.matchedRule] = (stats[r.matchedRule] || 0) + 1
    }
    sendResponse({ total: records.length, stats, enabled, mode })
  } else if ((msg as { type: string }).type === "SYNC_WATCHLIST") {
    watchlist = (msg as { watchlist: WatchlistEntry[] }).watchlist
    saveLocal()
    if (mode === "ws") send({ type: "updateWatchlist", watchlist })
  } else if ((msg as { type: string }).type === "SYNC_ENABLED") {
    enabled = (msg as { enabled: boolean }).enabled
    saveLocal()
    if (mode === "ws") send({ type: "updateEnabled", enabled })
  } else if ((msg as { type: string }).type === "TOGGLE_RECORD_PIN") {
    const id = (msg as { id: string }).id
    const idx = records.findIndex((r) => r.id === id)
    if (idx !== -1) {
      const rec = records[idx]
      const newPinned = rec.pinned ? 0 : 1
      const newScore = newPinned && rec.score == null ? 50 : rec.score
      records[idx] = { ...rec, pinned: newPinned, score: newScore }
      saveLocal()
      if (mode === "ws") send({ type: "recordUpdated", record: records[idx] })
    }
    sendResponse({ success: true })
  } else if ((msg as { type: string }).type === "SET_MODE") {
    const newMode = (msg as { mode: Mode }).mode
    if (newMode === "ws" || newMode === "local") {
      mode = newMode
      saveLocal()
      if (mode === "ws") {
        connect()
      } else {
        if (ws) {
          ws.onclose = null
          ws.close()
          ws = null
        }
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        pendingMessages = []
      }
    }
    sendResponse({ success: true })
  } else if ((msg as { type: string }).type === "GET_AI_CONFIG") {
    sendResponse({ provider: aiProvider, endpoint: aiEndpoint, apiKey: aiApiKey ? "●●●●" + aiApiKey.slice(-4) : "", model: aiModel })
  } else if ((msg as { type: string }).type === "SET_AI_CONFIG") {
    const cfg = msg as { provider?: string; endpoint?: string; apiKey?: string; model?: string }
    if (cfg.provider) aiProvider = cfg.provider
    if (cfg.endpoint) aiEndpoint = cfg.endpoint
    if (cfg.apiKey && !cfg.apiKey.startsWith("●●●●")) aiApiKey = cfg.apiKey
    if (cfg.model) aiModel = cfg.model
    saveLocal()
    sendResponse({ success: true })
  } else if ((msg as { type: string }).type === "AI_ANALYZE") {
    const prompt = buildAnalysisPrompt(records, watchlist)
    callAILite(prompt).then((raw) => {
      const jsonStr = extractJson(raw)
      let result = { summary: "", keywords: [] as string[] }
      if (jsonStr) {
        try { const parsed = JSON.parse(jsonStr); result.summary = parsed.summary || ""; result.keywords = parsed.keywords || [] } catch (e) {}
      }
      if (!result.summary && raw) result.summary = raw.slice(0, 200)
      sendResponse({ summary: result.summary, keywords: result.keywords })
    }).catch((e) => {
      sendResponse({ error: String(e) })
    })
    return true
  }
  return true
})

loadLocal().then(() => {
  if (mode === "ws") connect()
})
