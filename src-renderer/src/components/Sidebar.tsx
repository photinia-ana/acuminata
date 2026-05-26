import type { ActiveTab } from "@/store";
import { useAppStore } from "@/store";
import { useLocaleStore } from "@/store/locale";
import {
  LayoutDashboard,
  Clock,
  Brain,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const t = useLocaleStore((s) => s.t);

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: t("tab.overview"), icon: <LayoutDashboard size={18} /> },
    { key: "history", label: t("tab.history"), icon: <Clock size={18} /> },
    { key: "agent", label: t("tab.agent"), icon: <Brain size={18} /> },
    { key: "settings", label: t("tab.settings"), icon: <Settings size={18} /> },
  ];

  return (
    <aside className="flex h-full w-14 flex-col items-center gap-1 border-r border-border bg-card py-3">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
            activeTab === tab.key
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          )}
          title={tab.label}
        >
          {tab.icon}
        </button>
      ))}
    </aside>
  );
}
