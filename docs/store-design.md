# 状态管理设计 (Zustand)

## Store 接口

```typescript
// src-renderer/src/store/index.ts
interface AppStore {
  // ── 基础数据 ──
  watchlist: WatchlistEntry[];
  records: HistoryRecord[];
  stats: Stats | null;
  groupedStats: GroupedStats | null;
  enabled: boolean;

  // ── 分页与筛选 ──
  currentPage: number;
  pageSize: number;
  activeFilter: 'all' | 'pinned' | string; // string = label 伪装组
  searchQuery: string;
  totalRecords: number;
  selectedIds: Set<string>;

  // ── Agent ──
  recommendations: Recommendation[];
  pendingActions: PendingAction[];
  agentProfile: AgentProfile | null;
  agentLoading: boolean;

  // ── AI 配置 ──
  aiConfig: AiConfig | null;

  // ── 国际化 ──
  locale: Record<string, string>;
  localeCode: string;

  // ── UI 状态 ──
  wsConnected: boolean;
  activeTab: 'overview' | 'history' | 'agent' | 'settings';

  // ── Actions: 数据获取 ──
  fetchWatchlist: () => Promise<void>;
  fetchRecords: (page?: number, filter?: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchGroupedStats: () => Promise<void>;

  // ── Actions: 写入操作 ──
  addWatchlistEntry: (entry: WatchlistEntry) => Promise<void>;
  removeWatchlistEntry: (domain: string) => Promise<void>;
  deleteRecordIds: (ids: string[]) => Promise<void>;
  togglePin: (id: string, pinned: number, score: number | null) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  clearAllRecords: () => Promise<void>;
  exportData: () => Promise<string>;

  // ── Actions: 筛选与选择 ──
  setFilter: (filter: string) => void;
  setSearchQuery: (query: string) => void;
  toggleRecordSelection: (id: string) => void;
  clearSelection: () => void;
  setActiveTab: (tab: AppStore['activeTab']) => void;

  // ── Actions: Agent ──
  triggerAnalysis: () => Promise<void>;
  fetchRecommendations: () => Promise<void>;
  acceptRecommendation: (id: string) => Promise<void>;
  rejectRecommendation: (id: string) => Promise<void>;
  fetchPendingActions: () => Promise<void>;
  approveActions: (ids: string[]) => Promise<void>;
  dismissActions: (ids: string[]) => Promise<void>;
  fetchAgentProfile: () => Promise<void>;
  autoClean: () => Promise<void>;

  // ── Actions: 设置 ──
  fetchAiConfig: () => Promise<void>;
  updateAiConfig: (config: AiConfig) => Promise<void>;
  testAiConnection: () => Promise<{ok: boolean, response?: string, error?: string}>;
  fetchLocale: () => Promise<void>;
  setLocaleCode: (code: string) => Promise<void>;
}
```

---

## Store 数据流

```
React Component
    │
    ├─ onClick → store.action() → window.electronAPI.xxx() → IPC → main.js
    │                                                          │
    │                                                    ┌─────┘
    │                                                    ▼
    │                                              DB 操作 / AI 调用
    │                                                    │
    │                                                    ▼
    │                                          mainWindow.send('data-update')
    │                                                    │
    ▼                                                    ▼
useIpcListener('data-update', handler) ──→ store.fetchXxx() ──→ UI 更新
```
