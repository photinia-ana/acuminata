import { useAppStore } from "@/store";
import { Sidebar } from "@/components/Sidebar";
import { OverviewTab } from "@/components/overview/OverviewTab";
import { HistoryTab } from "@/components/history/HistoryTab";
import { AgentTab } from "@/components/agent/AgentTab";
import { SettingsTab } from "@/components/settings/SettingsTab";
import { WsStatusIndicator } from "@/components/overview/WsStatusIndicator";

export function AppShell() {
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部状态栏 — WS 连接状态 (R1.5) */}
        <header className="flex h-8 items-center justify-end border-b border-border px-4">
          <WsStatusIndicator />
        </header>

        {/* Tab 内容区 */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "history" && <HistoryTab />}
          {activeTab === "agent" && <AgentTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
