import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { X, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

/** 监控站点列表面板 — R1.2 */
export function WatchlistPanel() {
  const watchlist = useAppStore((s) => s.watchlist);
  const groupedStats = useAppStore((s) => s.groupedStats);
  const removeWatchlistEntry = useAppStore((s) => s.removeWatchlistEntry);
  const t = useLocaleStore((s) => s.t);

  const counts = groupedStats?.byLabel ?? {};

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t("watchlist.title")} ({watchlist.length})
      </h2>

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <ShieldQuestion size={32} className="opacity-40" />
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
                {/* 颜色指示点 */}
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color || "#71717a" }}
                />
                {/* 域名 */}
                <span className="truncate font-mono text-sm font-semibold">
                  {entry.domain}
                </span>
                {/* Label 标签 */}
                {entry.label && (
                  <span className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {entry.label}
                  </span>
                )}
                {/* 正则标识 */}
                {entry.regexFilter && (
                  <span
                    className="shrink-0 font-mono text-[10px] text-yellow-500"
                    title={`Regex: ${entry.regexFilter}`}
                  >
                    [.*]
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* 命中计数 */}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {counts[entry.label || entry.domain] || 0} hits
                </span>
                {/* 删除按钮 */}
                <button
                  onClick={() => removeWatchlistEntry(entry.domain)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                  title={t("toast.removed")}
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
