import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAppStore } from "@/store";
import { useIpcListener } from "@/hooks/useIpcListener";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useLocaleStore } from "@/store/locale";
import { Toaster } from "@/components/ui/toaster";

function App() {
  const fetchWatchlist = useAppStore((s) => s.fetchWatchlist);
  const fetchStats = useAppStore((s) => s.fetchStats);
  const fetchRecords = useAppStore((s) => s.fetchRecords);
  const fetchGroupedStats = useAppStore((s) => s.fetchGroupedStats);
  const loadLocale = useLocaleStore((s) => s.loadLocale);

  // IPC 事件监听 → 数据刷新 (R1.4)
  useIpcListener("data-update", () => {
    fetchStats();
    fetchRecords();
    fetchGroupedStats();
  });
  useIpcListener("watchlist-update", () => {
    fetchWatchlist();
  });

  // 键盘快捷键 (R5.2)
  useKeyboardShortcuts();

  // 初始化加载
  useEffect(() => {
    fetchWatchlist();
    fetchStats();
    fetchRecords();
    fetchGroupedStats();
    loadLocale();
  }, [fetchWatchlist, fetchStats, fetchRecords, fetchGroupedStats, loadLocale]);

  // 初始化时标记 WS 已连接 (R1.5 — preload 就绪即代表 WS 通道可用)
  useEffect(() => {
    useAppStore.setState({ wsConnected: true });
  }, []);

  return (
    <>
      <AppShell />
      <Toaster />
    </>
  );
}

export default App;
