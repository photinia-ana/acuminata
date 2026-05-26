import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { cn } from "@/lib/utils";

/** Header 栏中的 WS 连接状态 — R1.5 */
export function WsStatusIndicator() {
  const wsConnected = useAppStore((s) => s.wsConnected);
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          wsConnected ? "bg-green-500" : "bg-red-500",
        )}
      />
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-widest",
          wsConnected ? "text-green-500" : "text-red-500",
        )}
      >
        {wsConnected ? t("header.ws.connected") : t("header.ws.disconnected")}
      </span>
    </div>
  );
}
