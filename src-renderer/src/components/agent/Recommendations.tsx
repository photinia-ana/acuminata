import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import type { Recommendation } from "@/electron/api";
import { Check, X, ExternalLink, Sparkles, Trash2 } from "lucide-react";

/** AI 推荐列表 — R3.2 */
export function Recommendations() {
  const recommendations = useAppStore((s) => s.recommendations);
  const acceptRecommendation = useAppStore((s) => s.acceptRecommendation);
  const rejectRecommendation = useAppStore((s) => s.rejectRecommendation);
  const clearAllRecommendations = useAppStore((s) => s.clearAllRecommendations);
  const t = useLocaleStore((s) => s.t);

  if (recommendations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
        <Sparkles size={20} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("ai.recs.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 标题行 + 清空按钮 */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("ai.recs")} ({recommendations.length})
        </h2>
        <button
          onClick={() => {
            if (window.confirm(t("confirm.clearRecs"))) clearAllRecommendations();
          }}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 size={12} />
          {t("ai.clearRecs")}
        </button>
      </div>

      {/* 推荐卡片 */}
      {recommendations.map((rec) => (
        <RecommendationCard
          key={rec.id}
          rec={rec}
          onAccept={() => acceptRecommendation(rec.id)}
          onReject={() => rejectRecommendation(rec.id)}
        />
      ))}
    </div>
  );
}

function RecommendationCard({
  rec,
  onAccept,
  onReject,
}: {
  rec: Recommendation;
  onAccept: () => void;
  onReject: () => void;
}) {
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="group rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm font-medium">
            {rec.title || rec.url}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="shrink-0 rounded border border-purple-500/30 px-1.5 py-0.5 font-mono text-[10px] text-purple-400">
              {rec.groupLabel}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {rec.domain}
            </span>
          </div>
          {rec.reason && (
            <p className="mt-1.5 text-xs text-muted-foreground">{rec.reason}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onAccept}
            className="flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 py-1 font-mono text-[11px] text-green-400 transition-colors hover:bg-green-500/20"
            title={t("agent.accept")}
          >
            <Check size={12} />
            {t("agent.accept")}
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-destructive"
            title={t("agent.dismiss")}
          >
            <X size={12} />
            {t("agent.dismiss")}
          </button>
          <button
            onClick={() => window.electronAPI.openUrl(rec.url)}
            className="rounded border border-border p-1 text-muted-foreground transition-colors hover:text-foreground"
            title="Open URL"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
