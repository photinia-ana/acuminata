import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { Download, Trash2, Database } from "lucide-react";

/** 数据管理面板 — R4.3 */
export function DataManagement() {
  const clearAllRecords = useAppStore((s) => s.clearAllRecords);
  const exportData = useAppStore((s) => s.exportData);
  const stats = useAppStore((s) => s.stats);
  const t = useLocaleStore((s) => s.t);

  const handleExport = async () => {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acuminata-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Phase 5 添加 Toast
    }
  };

  const handleClear = async () => {
    if (
      !window.confirm(
        t("confirm.clearAll")
      )
    )
      return;
    await clearAllRecords();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <Database size={14} />
        {t("data.management")}
      </h2>

      {/* 数据统计 */}
      <div className="mb-4 rounded-md border border-border bg-background px-3 py-2">
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>{t("stats.totalRecords")}</span>
          <span className="text-foreground">{stats?.totalRecords ?? 0}</span>
        </div>
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>{t("stats.today")}</span>
          <span className="text-foreground">{stats?.todayRecords ?? 0}</span>
        </div>
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>{t("stats.sites")}</span>
          <span className="text-foreground">{stats?.trackedSites ?? 0}</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-4 py-2 font-mono text-xs font-medium transition-colors hover:bg-secondary/80"
        >
          <Download size={13} />
          {t("button.export")}
        </button>

        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 font-mono text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 size={13} />
          {t("button.clear")}
        </button>
      </div>
    </div>
  );
}
