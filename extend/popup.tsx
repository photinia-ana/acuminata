import { useEffect, useState } from "react"
import logoIcon from "url:~assets/icon.png"

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

const styles: Record<string, React.CSSProperties> = {
  body: {
    width: 360,
    background: "#000000",
    color: "#ffffff",
    fontFamily: "'Noto Sans SC', system-ui, sans-serif"
  },
  header: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #27272a"
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  title: { fontSize: 16, fontWeight: 500, lineHeight: 1.3 },
  subtitle: { fontSize: 11, color: "#767d88", fontWeight: 400 },
  statusDotOn: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#52c97a"
  },
  statusDotOff: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#767d88"
  },
  sectionLabel: {
    padding: "16px 16px 8px",
    fontSize: 11,
    fontWeight: 400,
    color: "#767d88",
    textTransform: "uppercase" as const,
    letterSpacing: "0.35px"
  },
  statGrid: {
    padding: "4px 16px 16px",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8
  },
  miniStat: {
    background: "#1a1a1a",
    border: "1px solid #27272a",
    borderRadius: 8,
    padding: 12
  },
  miniStatVal: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 24,
    fontWeight: 400,
    color: "#ffffff",
    lineHeight: 1.0,
    letterSpacing: "-0.5px"
  },
  miniStatLabel: {
    fontSize: 11,
    fontWeight: 400,
    color: "#767d88",
    marginTop: 4
  },
  footer: {
    padding: "12px 16px",
    display: "flex",
    gap: 8,
    borderTop: "1px solid #27272a"
  },
  btn: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #27272a",
    background: "transparent",
    color: "#767d88",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center" as const,
    fontFamily: "'Noto Sans SC', system-ui, sans-serif"
  }
}

function IndexPopup() {
  const [allRecords, setAllRecords] = useState<HistoryRecord[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState("ws")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const data = await chrome.storage.local.get([
      "records",
      "watchlist",
      "enabled",
      "mode"
    ])
    setAllRecords((data.records as HistoryRecord[]) || [])
    setWatchlist((data.watchlist as WatchlistEntry[]) || [])
    setEnabled(data.enabled !== false)
    setMode((data.mode as string) || "ws")
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = allRecords.filter(
    (r) => r.timestamp >= todayStart.getTime()
  ).length

  const domainStats: Record<string, number> = {}
  for (const r of allRecords) {
    domainStats[r.matchedRule] = (domainStats[r.matchedRule] || 0) + 1
  }
  const topDomain = Object.entries(domainStats).sort((a, b) => b[1] - a[1])[0]

  const modeLabel = mode === "ws" ? "WebSocket" : "Local"

  return (
    <div style={styles.body}>
      <style>
        {`:root, body { box-sizing: border-box; margin: 0; padding: 0; }`}
      </style>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <img src={logoIcon} style={{ width: 18, height: 18 }} />
          <div>
            <div style={styles.title}>Acuminata</div>
            <div style={styles.subtitle}>
              {enabled
                ? `追踪中 · ${modeLabel} · ${allRecords.length} 条`
                : `已暂停 · ${modeLabel} · ${allRecords.length} 条`}
            </div>
          </div>
        </div>
        <div style={enabled ? styles.statusDotOn : styles.statusDotOff} />
      </div>

      <div style={styles.sectionLabel}>总览</div>
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
              "watchlist"
            ])
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json"
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
