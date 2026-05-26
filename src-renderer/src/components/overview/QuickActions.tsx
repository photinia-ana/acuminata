import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { useToast } from "@/store/toast";
import { Switch } from "@/components/ui/switch";
import { Download, Trash2 } from "lucide-react";

/** 快捷操作栏 — R1.3 */
export function QuickActions() {
  const enabled = useAppStore((s) => s.enabled);
  const setTrackingEnabled = useAppStore((s) => s.setTrackingEnabled);
  const clearAllRecords = useAppStore((s) => s.clearAllRecords);
  const exportData = useAppStore((s) => s.exportData);
  const t = useLocaleStore((s) => s.t);
  const toast = useToast();

  const handleExport = async () => {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acuminata-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toast.exported"));
    } catch {
      toast.error(t("toast.opFailed"));
    }
  };

  const handleClear = async () => {
    if (!window.confirm(t("confirm.clearAll"))) return;
    await clearAllRecords();
    toast.success(t("toast.cleared"));
  };

  const handleToggle = async (checked: boolean) => {
    await setTrackingEnabled(checked);
    toast.info(checked ? t("toast.trackingOn") : t("toast.trackingOff"));
  };

  return (
    <div className="flex items-center gap-4">
      {/* 追踪开关 */}
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {enabled ? t("header.tracking") : t("header.paused")} {enabled ? "ON" : "OFF"}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* 导出数据 */}
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Download size={13} />
        {t("button.export")}
      </button>

      {/* 清空记录 */}
      <button
        onClick={handleClear}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 size={13} />
        {t("button.clear")}
      </button>
    </div>
  );
}
