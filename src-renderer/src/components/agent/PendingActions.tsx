import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import type { PendingAction } from "@/electron/api";
import { CheckCircle2, XCircle, Clock, Wrench } from "lucide-react";

/** 待审批操作队列 — R3.3 */
export function PendingActions() {
  const pendingActions = useAppStore((s) => s.pendingActions);
  const approveActions = useAppStore((s) => s.approveActions);
  const dismissActions = useAppStore((s) => s.dismissActions);
  const t = useLocaleStore((s) => s.t);

  if (pendingActions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-6 text-center">
        <Clock size={16} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("agent.noPending")}</p>
      </div>
    );
  }

  const allIds = pendingActions.map((a) => a.id);

  return (
    <div className="flex flex-col gap-2">
      {/* 标题 + 批量操作 */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("agent.pendingTitle")} ({pendingActions.length})
        </h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => approveActions(allIds)}
            className="flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-1 font-mono text-[11px] text-green-400 transition-colors hover:bg-green-500/20"
          >
            <CheckCircle2 size={12} />
            {t("agent.approveAll")}
          </button>
          <button
            onClick={() => dismissActions(allIds)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-destructive"
          >
            <XCircle size={12} />
            {t("agent.dismissAll")}
          </button>
        </div>
      </div>

      {/* 操作卡片 */}
      {pendingActions.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          onApprove={() => approveActions([action.id])}
          onDismiss={() => dismissActions([action.id])}
        />
      ))}
    </div>
  );
}

function ActionCard({
  action,
  onApprove,
  onDismiss,
}: {
  action: PendingAction;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="group rounded-md border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* 工具名 */}
          <div className="flex items-center gap-2">
            <Wrench size={13} className="text-yellow-500" />
            <span className="font-mono text-sm font-medium text-yellow-400">
              {action.tool_name}
            </span>
          </div>
          {/* 原因 */}
          <p className="mt-1 text-xs text-muted-foreground">{action.reason}</p>
          {/* 参数 (折叠) */}
          {action.args && Object.keys(action.args).length > 0 && (
            <pre className="mt-2 overflow-x-auto rounded bg-black/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {JSON.stringify(action.args, null, 2)}
            </pre>
          )}
        </div>

        {/* 单条操作按钮 */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onApprove}
            className="rounded border border-green-500/30 p-1 text-green-400 transition-colors hover:bg-green-500/20"
            title={t("agent.approve")}
          >
            <CheckCircle2 size={14} />
          </button>
          <button
            onClick={onDismiss}
            className="rounded border border-border p-1 text-muted-foreground transition-colors hover:text-destructive"
            title={t("agent.dismiss")}
          >
            <XCircle size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
