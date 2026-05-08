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
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const s: Record<string, React.CSSProperties> = {
  layout: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "40px 24px 80px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 48,
    paddingBottom: 24,
    borderBottom: "1px solid #2a2f42",
  },
  logoWrap: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoIcon: {
    width: 44,
    height: 44,
    background: "linear-gradient(135deg, #5b8dee, #e85d8a)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.3px",
  },
  logoSub: {
    fontSize: 12,
    color: "#7a80a0",
    fontFamily: "'JetBrains Mono', monospace",
  },
  toggleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "#7a80a0",
  },
  toggle: {
    position: "relative",
    width: 44,
    height: 24,
  },
  toggleInput: {
    opacity: 0,
    width: 0,
    height: 0,
    position: "absolute",
  },
  sliderOn: {
    position: "absolute",
    inset: 0,
    background: "#5b8dee",
    borderRadius: 24,
    cursor: "pointer",
  },
  sliderOff: {
    position: "absolute",
    inset: 0,
    background: "#2a2f42",
    borderRadius: 24,
    cursor: "pointer",
  },
  sliderDot: {
    position: "absolute",
    width: 18,
    height: 18,
    left: 3,
    top: 3,
    background: "white",
    borderRadius: "50%",
    transition: "transform 0.25s",
  },
  section: {
    marginBottom: 40,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "1.2px",
    color: "#7a80a0",
    fontFamily: "'JetBrains Mono', monospace",
  },
  addForm: {
    background: "#161921",
    border: "1px solid #2a2f42",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "1fr 160px 80px auto",
    gap: 10,
    alignItems: "end",
  },
  fieldLabel: {
    display: "block",
    fontSize: 11,
    color: "#7a80a0",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 6,
    letterSpacing: "0.5px",
  },
  fieldInput: {
    width: "100%",
    background: "#0d0f14",
    border: "1px solid #2a2f42",
    borderRadius: 8,
    padding: "9px 12px",
    color: "#e4e8f5",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    outline: "none",
  },
  colorInput: {
    width: "100%",
    height: 37,
    borderRadius: 8,
    border: "1px solid #2a2f42",
    background: "#0d0f14",
    cursor: "pointer",
    padding: "2px 4px",
    outline: "none",
  },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Noto Sans SC', sans-serif",
    background: "#5b8dee",
    color: "white",
    whiteSpace: "nowrap",
  },
  btnDanger: {
    background: "transparent",
    color: "#e85d5d",
    border: "1px solid #e85d5d",
    padding: "5px 10px",
    fontSize: 12,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  watchlist: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  watchItem: {
    background: "#161921",
    border: "1px solid #2a2f42",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  watchDomain: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
  },
  watchLabel: {
    fontSize: 12,
    color: "#7a80a0",
    background: "#1e2230",
    padding: "3px 8px",
    borderRadius: 4,
  },
  watchCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "#5b8dee",
    minWidth: 60,
    textAlign: "right",
  },
  emptyState: {
    textAlign: "center",
    padding: 40,
    color: "#7a80a0",
    fontSize: 14,
    background: "#161921",
    border: "1px dashed #2a2f42",
    borderRadius: 14,
  },
  statsBar: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    background: "#161921",
    border: "1px solid #2a2f42",
    borderRadius: 12,
    padding: "16px 20px",
  },
  statValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 600,
    color: "#5b8dee",
    lineHeight: 1,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#7a80a0",
  },
  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  btnExport: {
    background: "#161921",
    color: "#52c97a",
    border: "1px solid #52c97a",
    padding: "9px 16px",
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  btnClear: {
    background: "#161921",
    color: "#e85d5d",
    border: "1px solid #e85d5d",
    padding: "9px 16px",
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  toast: {
    position: "fixed",
    bottom: 24,
    right: 24,
    background: "#1e2230",
    border: "1px solid #2a2f42",
    borderRadius: 10,
    padding: "12px 18px",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 8,
    zIndex: 999,
  },
}

function OptionsIndex() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [enabled, setEnabled] = useState(true)
  const [inputDomain, setInputDomain] = useState("")
  const [inputLabel, setInputLabel] = useState("")
  const [inputColor, setInputColor] = useState("#5b8dee")
  const [toast, setToast] = useState<{
    msg: string
    type: "success" | "error"
  } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const data = await chrome.storage.local.get([
      "watchlist",
      "records",
      "enabled",
    ])
    setWatchlist((data.watchlist as WatchlistEntry[]) || [])
    setRecords((data.records as HistoryRecord[]) || [])
    setEnabled(data.enabled !== false)
  }

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const counts: Record<string, number> = {}
  for (const r of records) {
    counts[r.matchedRule] = (counts[r.matchedRule] || 0) + 1
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = records.filter(
    (r) => r.timestamp >= todayStart.getTime(),
  ).length

  async function addEntry() {
    const domain = inputDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
    const label = inputLabel.trim()
    const color = inputColor

    if (!domain) {
      showToast("请输入域名", "error")
      return
    }

    if (watchlist.find((e) => e.domain === domain)) {
      showToast("该域名已存在", "error")
      return
    }

    const next = [...watchlist, { domain, label, color }]
    setWatchlist(next)
    await chrome.storage.local.set({ watchlist: next })
    chrome.runtime.sendMessage({ type: "SYNC_WATCHLIST", watchlist: next })
    setInputDomain("")
    setInputLabel("")
    showToast(`已添加 ${domain}`, "success")
  }

  async function removeEntry(idx: number) {
    const entry = watchlist[idx]
    if (!confirm(`确认移除 ${entry.domain}？相关记录不会删除。`)) return
    const next = [...watchlist]
    next.splice(idx, 1)
    setWatchlist(next)
    await chrome.storage.local.set({ watchlist: next })
    chrome.runtime.sendMessage({ type: "SYNC_WATCHLIST", watchlist: next })
    showToast("已移除", "success")
  }

  async function toggleEnabled(val: boolean) {
    setEnabled(val)
    await chrome.storage.local.set({ enabled: val })
    chrome.runtime.sendMessage({ type: "SYNC_ENABLED", enabled: val })
    showToast(val ? "追踪已开启" : "追踪已暂停", "success")
  }

  async function exportData() {
    const data = await chrome.storage.local.get(["records", "watchlist"])
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `site-history-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast("导出成功", "success")
  }

  async function clearData() {
    if (!confirm("确认清空所有浏览记录？此操作不可撤销。")) return
    await chrome.storage.local.set({ records: [] })
    setRecords([])
    showToast("已清空所有记录", "success")
  }

  return (
    <div
      style={{
        background: "#0d0f14",
        color: "#e4e8f5",
        fontFamily: "'Noto Sans SC', sans-serif",
        minHeight: "100vh",
        lineHeight: 1.6,
      }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={s.layout}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logoWrap}>
            <div style={s.logoIcon}>📡</div>
            <div>
              <div style={s.logoTitle}>Site History Tracker</div>
              <div style={s.logoSub}>浏览记录追踪器 · 设置</div>
            </div>
          </div>
          <div style={s.toggleWrap}>
            <span>{enabled ? "追踪中" : "已暂停"}</span>
            <label
              style={{
                position: "relative",
                width: 44,
                height: 24,
              }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => toggleEnabled(e.target.checked)}
                style={{
                  opacity: 0,
                  width: 0,
                  height: 0,
                  position: "absolute",
                }}
              />
              <span
                style={enabled ? s.sliderOn : s.sliderOff}
              />
              <span
                style={
                  enabled
                    ? { ...s.sliderDot, transform: "translateX(20px)" }
                    : s.sliderDot
                }
              />
            </label>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statsBar}>
          <div style={s.statCard}>
            <div style={s.statValue}>{records.length}</div>
            <div style={s.statLabel}>总记录数</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statValue}>{watchlist.length}</div>
            <div style={s.statLabel}>追踪站点数</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statValue}>{todayCount}</div>
            <div style={s.statLabel}>今日记录</div>
          </div>
        </div>

        {/* Watchlist Management */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTitle}>追踪站点配置</div>
          </div>

          <div style={s.addForm}>
            <div style={s.formRow}>
              <div>
                <label style={s.fieldLabel}>域名 DOMAIN</label>
                <input
                  style={s.fieldInput}
                  type="text"
                  placeholder="bilibili.com"
                  value={inputDomain}
                  onChange={(e) => setInputDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addEntry()
                  }}
                />
              </div>
              <div>
                <label style={s.fieldLabel}>备注 LABEL</label>
                <input
                  style={s.fieldInput}
                  type="text"
                  placeholder="B站"
                  value={inputLabel}
                  onChange={(e) => setInputLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addEntry()
                  }}
                />
              </div>
              <div>
                <label style={s.fieldLabel}>颜色 COLOR</label>
                <input
                  style={s.colorInput}
                  type="color"
                  value={inputColor}
                  onChange={(e) => setInputColor(e.target.value)}
                />
              </div>
              <div>
                <label style={s.fieldLabel}>&nbsp;</label>
                <button style={s.btnPrimary} onClick={addEntry}>
                  + 添加
                </button>
              </div>
            </div>
          </div>

          <div style={s.watchlist}>
            {watchlist.length === 0 ? (
              <div style={s.emptyState}>暂无追踪站点，请在上方添加</div>
            ) : (
              watchlist.map((entry, idx) => (
                <div key={idx} style={s.watchItem}>
                  <div
                    style={{
                      ...s.colorDot,
                      background: entry.color || "#5b8dee",
                    }}
                  />
                  <div style={s.watchDomain}>
                    {escapeHtml(entry.domain)}
                  </div>
                  <div style={s.watchLabel}>
                    {escapeHtml(entry.label || "")}
                  </div>
                  <div style={s.watchCount}>
                    {counts[entry.domain] || 0} 条
                  </div>
                  <button
                    style={s.btnDanger}
                    onClick={() => removeEntry(idx)}>
                    移除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Data Management */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div style={s.sectionTitle}>数据管理</div>
          </div>
          <div style={s.actionRow}>
            <button style={s.btnExport} onClick={exportData}>
              ⬇ 导出 JSON
            </button>
            <button style={s.btnClear} onClick={clearData}>
              🗑 清空所有记录
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            ...s.toast,
            borderColor:
              toast.type === "success" ? "#52c97a" : "#e85d5d",
            color:
              toast.type === "success" ? "#52c97a" : "#e85d5d",
          }}>
          {toast.type === "success" ? "✓ " : "✗ "}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default OptionsIndex
