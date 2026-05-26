# IPC 桥接设计

## 4.1 类型声明 (`src-renderer/src/electron/api.ts`)

```typescript
// 声明 window.electronAPI 类型，与 preload.js 暴露的接口一一对应
export interface ElectronAPI {
  // 数据读写
  getWatchlist: () => Promise<WatchlistEntry[]>;
  getRecords: () => Promise<HistoryRecord[]>;
  getRecordsPage: (page: number, pageSize: number, filter: string) => Promise<{records: HistoryRecord[], total: number}>;
  deleteRecords: (ids: string[]) => Promise<void>;
  toggleRecordPin: (id: string, pinned: number, score: number | null) => Promise<void>;
  addToWatchlist: (entry: WatchlistEntry) => Promise<void>;
  removeFromWatchlist: (domain: string) => Promise<void>;
  getStatistics: () => Promise<Stats>;
  getStats: () => Promise<GroupedStats>;
  setEnabled: (enabled: boolean) => Promise<void>;
  clearRecords: () => Promise<void>;
  exportData: () => Promise<string>;
  openUrl: (url: string) => Promise<void>;

  // 设置与国际化
  getLocale: () => Promise<Record<string, string>>;
  setLocale: (code: string) => Promise<void>;
  getAiConfig: () => Promise<AiConfig>;
  setAiConfig: (config: AiConfig) => Promise<void>;
  testAiConnection: () => Promise<{ok: boolean, response?: string, error?: string, provider: string}>;

  // Agent
  triggerAgentAnalysis: () => Promise<AgentAnalysisResult>;
  getRecommendations: () => Promise<Recommendation[]>;
  rejectRecommendation: (id: string) => Promise<boolean>;
  acceptRecommendation: (id: string) => Promise<boolean>;
  clearRecommendations: () => Promise<boolean>;
  agentGetPending: () => Promise<PendingAction[]>;
  agentApproveActions: (ids: string[]) => Promise<void>;
  agentDismissActions: (ids: string[]) => Promise<void>;
  agentGetProfile: () => Promise<AgentProfile>;
  agentAutoClean: () => Promise<void>;

  // 事件监听 (注意: preload 中 ipcRenderer.on 无法返回清理函数，需 Hook 封装)
  onUpdate: (callback: (data: any) => void) => void;
  onWatchlistUpdate: (callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## 4.2 事件监听 Hook (`src-renderer/src/hooks/useIpcListener.ts`)

preload.js 中 `ipcRenderer.on` 不返回清理函数，需在 React 组件中手动移除：

```typescript
import { useEffect } from 'react';

// 封装 IPC 事件监听的生命周期管理
export function useIpcListener(
  channel: 'data-update' | 'watchlist-update',
  handler: (data: any) => void
) {
  useEffect(() => {
    const api = window.electronAPI;
    if (channel === 'data-update') {
      api.onUpdate(handler);
    } else if (channel === 'watchlist-update') {
      api.onWatchlistUpdate(handler);
    }
    // ⚠️ 当前 preload 未暴露 removeListener，后续需增强
    // TODO: 在 preload.js 中添加 removeListener 方法
    return () => {
      // 清理: 需 preload 配合暴露 removeListener
    };
  }, [channel, handler]);
}
```

---

## 4.3 IPC 通道完整清单

### 数据读写

| 通道 | 方向 | 参数 | 返回值 |
|------|------|------|--------|
| `get-watchlist` | R→M | — | `WatchlistEntry[]` |
| `add-watchlist` | R→M | `entry: WatchlistEntry` | `void` |
| `remove-watchlist` | R→M | `domain: string` | `void` |
| `get-records` | R→M | — | `HistoryRecord[]` |
| `get-records-page` | R→M | `page, pageSize, filter` | `{records, total}` |
| `delete-records` | R→M | `ids: string[]` | `void` |
| `toggle-record-pin` | R→M | `id, pinned, score` | `void` |
| `open-url` | R→M | `url: string` | `void` |
| `get-statistics` | R→M | — | `Stats` |
| `get-stats` | R→M | — | `GroupedStats` |
| `set-enabled` | R→M | `enabled: boolean` | `void` |
| `clear-records` | R→M | — | `void` |
| `export-data` | R→M | — | `string (JSON)` |

### 设置与国际化

| 通道 | 方向 | 参数 | 返回值 |
|------|------|------|--------|
| `get-locale` | R→M | — | `Record<string, string>` |
| `set-locale` | R→M | `code: string` | `void` |
| `get-ai-config` | R→M | — | `AiConfig` (apiKey 脱敏) |
| `set-ai-config` | R→M | `config: AiConfig` | `void` |
| `test-ai-connection` | R→M | — | `{ok, response?, error?, provider}` |

### Agent 相关

| 通道 | 方向 | 参数 | 返回值 |
|------|------|------|--------|
| `trigger-agent-analysis` | R→M | — | `{summary, keywords, recordsAnalyzed, pendingActions}` |
| `get-recommendations` | R→M | — | `Recommendation[]` |
| `reject-recommendation` | R→M | `id: string` | `boolean` |
| `accept-recommendation` | R→M | `id: string` | `boolean` |
| `clear-recommendations` | R→M | — | `boolean` |
| `agent-get-pending` | R→M | — | `PendingAction[]` |
| `agent-approve-actions` | R→M | `ids: string[]` | `void` |
| `agent-dismiss-actions` | R→M | `ids: string[]` | `void` |
| `agent-get-profile` | R→M | — | `AgentProfile` |
| `agent-auto-clean` | R→M | — | `void` |

### 事件 (M→R 推送)

| 通道 | 触发场景 | 数据 |
|------|----------|------|
| `data-update` | 记录变更、扩展上报 | `{type, record?}` |
| `watchlist-update` | 监控列表变更 | `{type, entry?}` |

> R = 渲染进程, M = 主进程
