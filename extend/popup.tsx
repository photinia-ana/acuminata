import { useEffect, useState } from "react"

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

const styles: Record<string, React.CSSProperties> = {
  body: {
    width: 360,
    background: "#0d0f14",
    color: "#e4e8f5",
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  header: {
    padding: "16px 16px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #2a2f42",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  title: { fontSize: 14, fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#7a80a0", fontFamily: "'JetBrains Mono', monospace" },
  statusDotOn: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#52c97a", boxShadow: "0 0 6px #52c97a",
    animation: "pulse 2s infinite",
  },
  statusDotOff: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#7a80a0",
  },
  tabs: { display: "flex", borderBottom: "1px solid #2a2f42" },
  tab: {
    flex: 1, padding: 10, textAlign: "center",
    fontSize: 12, color: "#7a80a0", cursor: "pointer",
    borderBottom: "2px solid transparent",
    fontFamily: "'JetBrains Mono', monospace",
  },
  tabActive: {
    flex: 1, padding: 10, textAlign: "center",
    fontSize: 12, color: "#5b8dee", cursor: "pointer",
    borderBottom: "2px solid #5b8dee",
    fontFamily: "'JetBrains Mono', monospace",
  },
  filterBar: {
    padding: "10px 14px",
    borderBottom: "1px solid #2a2f42",
    display: "flex", gap: 6, overflowX: "auto",
  },
  filterChip: {
    padding: "4px 10px", borderRadius: 20,
    border: "1px solid #2a2f42",
    fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: "'JetBrains Mono', monospace",
  },
  filterChipActive: {
    padding: "4px 10px", borderRadius: 20,
    border: "1px solid #5b8dee",
    fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: "'JetBrains Mono', monospace",
    background: "#5b8dee", color: "white",
  },
  records: { maxHeight: 360, overflowY: "auto" },
  recordRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid #2a2f42",
  },
  recordContent: {
    flex: 1,
    overflow: "hidden",
    cursor: "pointer",
  },
  recordItem: {
    cursor: "pointer",
  },
  recordTitle: {
    fontSize: 13, whiteSpace: "nowrap",
    overflow: "hidden", textOverflow: "ellipsis",
    marginBottom: 3,
  },
  recordMeta: { display: "flex", alignItems: "center", gap: 8 },
  recordDomain: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    padding: "2px 6px", borderRadius: 3,
    background: "#1e2230",
  },
  recordTime: {
    fontSize: 10, color: "#7a80a0",
    fontFamily: "'JetBrains Mono', monospace",
  },
  pinBtn: {
    flexShrink: 0,
    padding: "3px 8px",
    fontSize: 11,
    borderRadius: 5,
    border: "1px solid #2a2f42",
    background: "transparent",
    color: "#7a80a0",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
  pinBtnActive: {
    flexShrink: 0,
    padding: "3px 8px",
    fontSize: 11,
    borderRadius: 5,
    border: "1px solid #f0a040",
    background: "transparent",
    color: "#f0a040",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
  statGrid: {
    padding: 16, display: "grid",
    gridTemplateColumns: "1fr 1fr", gap: 10,
  },
  miniStat: {
    background: "#161921",
    border: "1px solid #2a2f42",
    borderRadius: 8, padding: 12,
  },
  miniStatVal: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22, fontWeight: 600, color: "#5b8dee",
  },
  miniStatLabel: { fontSize: 11, color: "#7a80a0", marginTop: 2 },
  footer: {
    padding: "10px 14px", display: "flex", gap: 8,
    borderTop: "1px solid #2a2f42",
  },
  btn: {
    flex: 1, padding: 7, borderRadius: 6,
    border: "1px solid #2a2f42",
    background: "transparent", color: "#7a80a0",
    fontSize: 12, cursor: "pointer", textAlign: "center" as const,
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  empty: {
    padding: 30, textAlign: "center" as const,
    color: "#7a80a0", fontSize: 13,
  },
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return "刚刚"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function IndexPopup() {
  const [allRecords, setAllRecords] = useState<HistoryRecord[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [enabled, setEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState<"records" | "stats">("records")
  const [activeFilter, setActiveFilter] = useState("all")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const data = await chrome.storage.local.get(["records", "watchlist", "enabled"])
    setAllRecords((data.records as HistoryRecord[]) || [])
    setWatchlist((data.watchlist as WatchlistEntry[]) || [])
    setEnabled(data.enabled !== false)
  }

  function getDomainColor(domain: string): string {
    const entry = watchlist.find((e) => e.domain === domain)
    return entry?.color || "#5b8dee"
  }

  const domains = [...new Set(allRecords.map((r) => r.matchedRule))]
  const filtered =
    activeFilter === "all"
      ? allRecords
      : allRecords.filter((r) => r.matchedRule === activeFilter)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = allRecords.filter(
    (r) => r.timestamp >= todayStart.getTime(),
  ).length

  const domainStats: Record<string, number> = {}
  for (const r of allRecords) {
    domainStats[r.matchedRule] = (domainStats[r.matchedRule] || 0) + 1
  }
  const topDomain = Object.entries(domainStats).sort(
    (a, b) => b[1] - a[1],
  )[0]

  return (
    <div style={styles.body}>
      <style>
        {`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          :root { box-sizing: border-box; margin: 0; padding: 0; }
        `}
      </style>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 20 }}>📡</span>
          <div>
            <div style={styles.title}>History Tracker</div>
            <div style={styles.subtitle}>
              {enabled
                ? `追踪中 · ${allRecords.length} 条记录`
                : `已暂停 · ${allRecords.length} 条记录`}
            </div>
          </div>
        </div>
        <div style={enabled ? styles.statusDotOn : styles.statusDotOff} />
      </div>

      <div style={styles.tabs}>
        <div
          style={activeTab === "records" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("records")}>
          记录
        </div>
        <div
          style={activeTab === "stats" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("stats")}>
          统计
        </div>
      </div>

      {activeTab === "records" && (
        <>
          <div style={styles.filterBar}>
            <div
              style={
                activeFilter === "all"
                  ? styles.filterChipActive
                  : styles.filterChip
              }
              onClick={() => setActiveFilter("all")}>
              全部
            </div>
            {domains.map((d) => {
              const color = getDomainColor(d)
              const count = allRecords.filter(
                (r) => r.matchedRule === d,
              ).length
              const active = activeFilter === d
              return (
                <div
                  key={d}
                  style={
                    active
                      ? {
                          ...styles.filterChipActive,
                          background: color,
                          borderColor: color,
                        }
                      : {
                          ...styles.filterChip,
                          borderColor: `${color}40`,
                        }
                  }
                  onClick={() => setActiveFilter(d)}>
                  {d}{" "}
                  <span style={{ opacity: 0.7 }}>{count}</span>
                </div>
              )
            })}
          </div>

          <div style={styles.records}>
            {filtered.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                暂无记录
              </div>
            ) : (
              filtered.slice(0, 100).map((r) => {
                const color = getDomainColor(r.matchedRule)
                return (
                  <div key={r.id} style={styles.recordRow}>
                    <div
                      style={styles.recordContent}
                      onClick={() => chrome.tabs.create({ url: r.url })}>
                      <div style={styles.recordTitle}>
                        {escapeHtml(r.title || r.url)}
                      </div>
                      <div style={styles.recordMeta}>
                        <span
                          style={{ ...styles.recordDomain, color }}>
                          {r.matchedRule}
                        </span>
                        <span style={styles.recordTime}>
                          {formatTime(r.timestamp)}
                        </span>
                      </div>
                    </div>
                    <button
                      style={r.pinned ? styles.pinBtnActive : styles.pinBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        chrome.runtime.sendMessage(
                          { type: "TOGGLE_RECORD_PIN", id: r.id },
                          () => {
                            setAllRecords((prev) =>
                              prev.map((rec) =>
                                rec.id === r.id
                                  ? {
                                      ...rec,
                                      pinned: rec.pinned ? 0 : 1,
                                      score:
                                        !rec.pinned && rec.score == null
                                          ? 50
                                          : rec.score,
                                    }
                                  : rec,
                              ),
                            )
                          },
                        )
                      }}>
                      {r.pinned ? `★ ${r.score ?? 50}` : "Pin"}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {activeTab === "stats" && (
        <div style={styles.statGrid}>
          <div style={styles.miniStat}>
            <div style={styles.miniStatVal}>{allRecords.length}</div>
            <div style={styles.miniStatLabel}>总记录数</div>
          </div>
          <div style={styles.miniStat}>
            <div style={styles.miniStatVal}>{todayCount}</div>
            <div style={styles.miniStatLabel}>今日记录</div>
          </div>
          <div style={styles.miniStat}>
            <div style={styles.miniStatVal}>{watchlist.length}</div>
            <div style={styles.miniStatLabel}>追踪站点</div>
          </div>
          <div style={styles.miniStat}>
            <div style={{ ...styles.miniStatVal, fontSize: 14 }}>
              {topDomain ? topDomain[0] : "-"}
            </div>
            <div style={styles.miniStatLabel}>
              最多访问 {topDomain ? `${topDomain[1]}次` : ""}
            </div>
          </div>
        </div>
      )}

      <div style={styles.footer}>
        <button
          style={styles.btn}
          onClick={() => {
            chrome.runtime.openOptionsPage()
          }}>
          设置
        </button>
        <button
          style={styles.btn}
          onClick={async () => {
            const data = await chrome.storage.local.get([
              "records",
              "watchlist",
            ])
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `acuminata-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
          }}>
          导出
        </button>
      </div>
    </div>
  )
}

export default IndexPopup
