import { useEffect } from "react";
import type { ActiveTab } from "@/store";
import { useAppStore } from "@/store";

/** 键盘快捷键 — R5.2 */

const TAB_KEYS: ActiveTab[] = ["overview", "history", "agent", "settings"];

export function useKeyboardShortcuts() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd + 1~4 → 切换 Tab
      if (e.ctrlKey || e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 4) {
          e.preventDefault();
          setActiveTab(TAB_KEYS[num - 1]);
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveTab]);
}
