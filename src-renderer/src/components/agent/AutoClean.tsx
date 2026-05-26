import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { Eraser, Loader2 } from "lucide-react";

/** 自动清理触发按钮 — R3.5 */
export function AutoClean() {
  const agentLoading = useAppStore((s) => s.agentLoading);
  const autoClean = useAppStore((s) => s.autoClean);
  const t = useLocaleStore((s) => s.t);

  const handleAutoClean = async () => {
    if (
      !window.confirm(
        t("agent.autoCleanConfirm")
      )
    )
      return;
    await autoClean();
  };

  return (
    <button
      onClick={handleAutoClean}
      disabled={agentLoading}
      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      {agentLoading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <Eraser size={13} />
      )}
      {t("agent.autoClean")}
    </button>
  );
}
