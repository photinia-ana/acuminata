// TabTracker — owns chrome.tabs event listeners, dwell-time logic, and record creation.
// Emits plain events; the caller persists them.
// Designed so a future RecordStore abstraction can replace the persistence layer.

import type { WatchlistEntry, HistoryRecord } from "../shared/types"

type RecordEvent = { type: "record"; data: HistoryRecord }
type DwellTimeEvent = { type: "dwellTime"; data: HistoryRecord }

type RecordCallback = (evt: RecordEvent) => void
type DwellTimeCallback = (evt: DwellTimeEvent) => void

interface TabTrackerDeps {
  matchesWatchlist: (url: string) => WatchlistEntry | null
  extractDomain: (url: string) => string | null
}

class TabTracker {
  private records: HistoryRecord[] = []
  private tabEntryTimes: Record<number, number> = {}
  private tabLastRecordId: Record<number, string> = {}
  private onRecordCbs: Set<RecordCallback> = new Set()
  private onDwellTimeCbs: Set<DwellTimeCallback> = new Set()
  private maxRecords = 500

  constructor(private deps: TabTrackerDeps) {}

  onRecord(cb: RecordCallback) { this.onRecordCbs.add(cb) }
  onDwellTime(cb: DwellTimeCallback) { this.onDwellTimeCbs.add(cb) }

  start() {
    chrome.tabs.onUpdated.addListener(this.onTabUpdated)
    chrome.tabs.onActivated.addListener(this.onTabActivated)
    chrome.tabs.onRemoved.addListener(this.onTabRemoved)
  }

  stop() {
    chrome.tabs.onUpdated.removeListener(this.onTabUpdated)
    chrome.tabs.onActivated.removeListener(this.onTabActivated)
    chrome.tabs.onRemoved.removeListener(this.onTabRemoved)
  }

  private onTabUpdated = (tabId: number, changeInfo: { status?: string; url?: string }, tab: { url?: string; title?: string; favIconUrl?: string }) => {
    if (changeInfo.status === "complete" && tab.url) {
      this.handleUrl(tab.url, tabId, tab.title || "", tab.favIconUrl || "")
    }
  }

  private onTabActivated = (activeInfo: { tabId: number; previousTabId?: number }) => {
    const prevTabId = Object.keys(this.tabEntryTimes).map(Number).find((t) => t !== activeInfo.tabId)
    if (prevTabId) this.flushDwellTime(prevTabId)
    this.tabEntryTimes[activeInfo.tabId] = Date.now()
  }

  private onTabRemoved = (tabId: number) => {
    this.flushDwellTime(tabId)
  }

  async handleUrl(url: string, tabId: number, title: string, favIconUrl?: string) {
    if (!url) return
    if (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("moz-extension://")
    )
      return

    const matched = this.deps.matchesWatchlist(url)
    if (!matched) return

    const now = Date.now()
    const isDuplicate = this.records.some(
      (r) => r.url === url && r.tabId === tabId && now - r.timestamp < 60000,
    )
    if (isDuplicate) return

    this.tabEntryTimes[tabId] = now

    const record: HistoryRecord = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      title: title || "",
      domain: this.deps.extractDomain(url) || matched.domain,
      matchedRule: matched.domain,
      tabId,
      timestamp: now,
      favIconUrl: favIconUrl || "",
    }

    this.records.unshift(record)
    if (this.records.length > this.maxRecords) this.records.splice(this.maxRecords)
    this.tabLastRecordId[tabId] = record.id

    for (const cb of this.onRecordCbs) cb({ type: "record", data: record })

    await this.injectMeta(tabId, record)
  }

  private async injectMeta(tabId: number, record: HistoryRecord) {
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
        for (const cb of this.onRecordCbs) cb({ type: "record", data: record })
      }
    } catch (e) {
      // ignore — can't inject on chrome:// or restricted pages
    }
  }

  flushDwellTime(tabId: number) {
    const start = this.tabEntryTimes[tabId]
    const recordId = this.tabLastRecordId[tabId]
    if (!start || !recordId) return
    const dwellTime = Date.now() - start
    if (dwellTime < 1000) return
    const idx = this.records.findIndex((r) => r.id === recordId)
    if (idx !== -1) {
      this.records[idx] = { ...this.records[idx], dwellTime }
      for (const cb of this.onDwellTimeCbs) cb({ type: "dwellTime", data: this.records[idx] })
    }
    delete this.tabEntryTimes[tabId]
    delete this.tabLastRecordId[tabId]
  }

  getRecords() {
    return this.records
  }
}

export { TabTracker }
export type { TabTrackerDeps, RecordEvent, DwellTimeEvent }
