import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { Switch } from "@/components/ui/switch";
import { Power } from "lucide-react";
import { AiConfigPanel } from "./AiConfigPanel";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { DataManagement } from "./DataManagement";
import { WatchlistEditor } from "./WatchlistEditor";

export function SettingsTab() {
  const enabled = useAppStore((s) => s.enabled);
  const setTrackingEnabled = useAppStore((s) => s.setTrackingEnabled);
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="space-y-6 p-6">
      <h1 className="font-mono text-xl font-semibold tracking-tight">
        {t("tab.settings")}
      </h1>

      {/* 全局追踪开关 */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Power size={14} className="text-muted-foreground" />
            <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("header.tracking")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => setTrackingEnabled(checked)}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {enabled ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* 监控站点编辑器 */}
      <WatchlistEditor />

      {/* AI 配置 */}
      <AiConfigPanel />

      {/* 语言切换 */}
      <LocaleSwitcher />

      {/* 数据管理 */}
      <DataManagement />
    </div>
  );
}
