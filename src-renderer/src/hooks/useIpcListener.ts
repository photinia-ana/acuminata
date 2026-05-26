import { useEffect, useCallback, useRef } from "react";

/**
 * 封装 IPC 事件监听的生命周期管理 — R5.4
 *
 * 通过维护回调映射实现组件卸载时的清理，
 * 避免 preload 未暴露 removeListener 导致的内存泄漏。
 */

type Channel = "data-update" | "watchlist-update";

// 全局回调映射 — 用于在组件卸载时标记清理
const activeListeners = new Map<Channel, Set<(data: unknown) => void>>();

export function useIpcListener(
  channel: Channel,
  handler: (data: unknown) => void
) {
  const stableHandler = useCallback(handler, [handler]);
  const handlerRef = useRef(stableHandler);
  handlerRef.current = stableHandler;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // 包装器 — 检查是否仍然活跃
    const wrapped = (data: unknown) => {
      if (activeListeners.get(channel)?.has(stableHandler)) {
        stableHandler(data);
      }
    };

    // 注册到全局映射
    if (!activeListeners.has(channel)) {
      activeListeners.set(channel, new Set());
    }
    activeListeners.get(channel)!.add(stableHandler);

    // 注册到 IPC
    if (channel === "data-update") {
      api.onUpdate(wrapped);
    } else if (channel === "watchlist-update") {
      api.onWatchlistUpdate(wrapped);
    }

    return () => {
      // 清理: 从活跃集合中移除
      activeListeners.get(channel)?.delete(stableHandler);
    };
  }, [channel, stableHandler]);
}
