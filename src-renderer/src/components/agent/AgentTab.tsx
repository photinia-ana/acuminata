import { useEffect } from "react";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import { AgentChat } from "./AgentChat";
import { Recommendations } from "./Recommendations";
import { PendingActions } from "./PendingActions";
import { AgentProfile } from "./AgentProfile";
import { AutoClean } from "./AutoClean";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Agent Tab — R3.x 完整迁移 */
export function AgentTab() {
  const fetchAgentProfile = useAppStore((s) => s.fetchAgentProfile);
  const fetchRecommendations = useAppStore((s) => s.fetchRecommendations);
  const fetchPendingActions = useAppStore((s) => s.fetchPendingActions);
  const t = useLocaleStore((s) => s.t);

  // 进入 Tab 时加载 Agent 数据
  useEffect(() => {
    fetchRecommendations();
    fetchPendingActions();
    fetchAgentProfile();
  }, [fetchRecommendations, fetchPendingActions, fetchAgentProfile]);

  return (
    <div className="flex h-full">
      {/* 左侧: 对话区 */}
      <div className="flex w-1/2 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            {t("tab.agent")}
          </h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <AgentChat />
        </div>
      </div>

      {/* 右侧: 推荐与操作 */}
      <div className="w-1/2">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4">
            {/* 快捷操作 */}
            <div className="flex items-center gap-2">
              <AutoClean />
            </div>

            {/* 用户画像 */}
            <AgentProfile />

            {/* 推荐列表 */}
            <Recommendations />

            {/* 待审批操作 */}
            <PendingActions />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
