import { useEffect } from "react";
import { useToastStore } from "@/store/toast";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Toast 渲染容器 — 挂载在 App 根节点 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 font-mono text-xs shadow-lg transition-all animate-in slide-in-from-right",
            toast.type === "success" &&
              "border-green-500/30 bg-green-500/10 text-green-400",
            toast.type === "error" &&
              "border-red-500/30 bg-red-500/10 text-red-400",
            toast.type === "info" &&
              "border-blue-500/30 bg-blue-500/10 text-blue-400"
          )}
        >
          {toast.type === "success" && <CheckCircle2 size={14} />}
          {toast.type === "error" && <AlertCircle size={14} />}
          {toast.type === "info" && <Info size={14} />}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 opacity-50 hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
