import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { Brain, Shield } from "lucide-react";

/** 用户画像展示 — R3.4 */
export function AgentProfile() {
  const agentProfile = useAppStore((s) => s.agentProfile);
  const analysisResult = useAppStore((s) => s.analysisResult);
  const t = useLocaleStore((s) => s.t);

  if (!agentProfile && !analysisResult) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 分析摘要 */}
      {analysisResult && !analysisResult.error && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
          <div className="mb-2 font-mono text-[11px] font-medium uppercase tracking-widest text-purple-400">
            {t("agent.analysisSummary")}
          </div>
          <p className="text-sm text-foreground">{analysisResult.summary}</p>
          <div className="mt-2 flex gap-4">
            <span className="font-mono text-[11px] text-muted-foreground">
              {t("agent.records")}: {analysisResult.recordsAnalyzed}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {t("agent.pending")}: {analysisResult.pendingActions}
            </span>
          </div>
        </div>
      )}

      {/* 偏好 */}
      {agentProfile && agentProfile.preferences.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Brain size={14} className="text-green-400" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-green-400">
              {t("agent.preferences")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {agentProfile.preferences.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {p.key}: {p.value}
                </span>
                <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 font-mono text-[10px] text-green-400">
                  {p.weight.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 反模式 */}
      {agentProfile && agentProfile.antiPatterns.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Shield size={14} className="text-red-400" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-red-400">
              {t("agent.profileAnti")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {agentProfile.antiPatterns.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {p.key}: {p.value}
                </span>
                <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-400">
                  {p.weight.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
