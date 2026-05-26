import { useEffect } from "react";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { StatsCards } from "./StatsCards";
import { WatchlistPanel } from "./WatchlistPanel";
import { QuickActions } from "./QuickActions";

/** Overview Tab — Phase 1 全功能迁移 */
export function OverviewTab() {
  const stats = useAppStore((s) => s.stats);
  const watchlist = useAppStore((s) => s.watchlist);
  const fetchStats = useAppStore((s) => s.fetchStats);
  const fetchGroupedStats = useAppStore((s) => s.fetchGroupedStats);
  const fetchWatchlist = useAppStore((s) => s.fetchWatchlist);
  const fetchRecords = useAppStore((s) => s.fetchRecords);
  const setTrackingEnabled = useAppStore((s) => s.setTrackingEnabled);
  const t = useLocaleStore((s) => s.t);

  // 初始加载 (App.tsx 已负责, 此处为 Tab 级别兜底)
  useEffect(() => {
    if (!stats) fetchStats();
    if (watchlist.length === 0) fetchWatchlist();
    fetchGroupedStats();
  }, []);

  // 同步 enabled 状态到 store
  useEffect(() => {
    if (stats) {
      setTrackingEnabled(stats.enabled);
    }
  }, [stats?.enabled]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      {/* 页面标题 */}
      <h1 className="mb-6 font-mono text-xl font-semibold tracking-tight">
        {t("tab.overview")}
      </h1>

      {/* 统计卡片 — R1.1 */}
      <div className="mb-6">
        <StatsCards />
      </div>

      {/* 快捷操作 — R1.3 */}
      <div className="mb-6">
        <QuickActions />
      </div>

      {/* Watchlist — R1.2 */}
      <WatchlistPanel />
    </div>
  );
}
