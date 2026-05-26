import { useState } from "react";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import type { WatchlistEntry } from "@/electron/api";
import { Plus, X, ShieldQuestion, Code } from "lucide-react";

/** 监控站点编辑器 — R4.4 */
export function WatchlistEditor() {
  const watchlist = useAppStore((s) => s.watchlist);
  const groupedStats = useAppStore((s) => s.groupedStats);
  const addWatchlistEntry = useAppStore((s) => s.addWatchlistEntry);
  const removeWatchlistEntry = useAppStore((s) => s.removeWatchlistEntry);
  const t = useLocaleStore((s) => s.t);

  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#5b8dee");
  const [regexTarget, setRegexTarget] = useState<"url" | "title">("url");
  const [regexFilter, setRegexFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const counts = groupedStats?.byLabel ?? {};

  const handleAdd = async () => {
    if (!domain.trim()) return;
    const entry: WatchlistEntry = {
      domain: domain.trim(),
      label: label.trim(),
      color,
      regexFilter: regexFilter.trim() || undefined,
      regexTarget: regexFilter.trim() ? regexTarget : undefined,
    };
    await addWatchlistEntry(entry);
    // 重置表单
    setDomain("");
    setLabel("");
    setColor("#5b8dee");
    setRegexFilter("");
    setRegexTarget("url");
    setShowForm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Code size={14} />
          {t("watchlist.title")} ({watchlist.length})
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus size={12} />
          {t("watchlist.add")}
        </button>
      </div>

      {/* 添加表单 */}
      {showForm && (
        <div className="mb-4 space-y-3 rounded-md border border-dashed border-primary/30 bg-primary/5 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("watchlist.domainPlaceholder")}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("watchlist.labelPlaceholder")}
              className="w-28 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={regexTarget}
              onChange={(e) =>
                setRegexTarget(e.target.value as "url" | "title")
              }
              className="w-28 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="url">{t("watchlist.regexUrl")}</option>
              <option value="title">{t("watchlist.regexTitle")}</option>
            </select>
            <input
              type="text"
              value={regexFilter}
              onChange={(e) => setRegexFilter(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("watchlist.regexPlaceholder")}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleAdd}
              disabled={!domain.trim()}
              className="shrink-0 rounded-md border border-primary bg-primary/10 px-4 py-2 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {t("watchlist.add")}
            </button>
          </div>
        </div>
      )}

      {/* 已有列表 */}
      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <ShieldQuestion size={28} className="opacity-40" />
          <p className="text-sm">{t("watchlist.empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {watchlist.map((entry) => (
            <div
              key={entry.domain}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color || "#71717a" }}
                />
                <span className="truncate font-mono text-sm font-semibold">
                  {entry.domain}
                </span>
                {entry.label && (
                  <span className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {entry.label}
                  </span>
                )}
                {entry.regexFilter && (
                  <span
                    className="shrink-0 font-mono text-[10px] text-yellow-500"
                    title={`Regex: ${entry.regexFilter} (${entry.regexTarget || "url"})`}
                  >
                    [.*]
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {counts[entry.label || entry.domain] || 0} hits
                </span>
                <button
                  onClick={() => removeWatchlistEntry(entry.domain)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                  title={t("confirm.removeDomain", { domain: entry.domain })}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
