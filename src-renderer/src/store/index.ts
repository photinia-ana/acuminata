import { create } from "zustand";
import type {
  WatchlistEntry,
  HistoryRecord,
  Stats,
  GroupedStats,
  AiConfig,
  Recommendation,
  PendingAction,
  AgentProfile,
  AgentAnalysisResult,
} from "@/electron/api";

export type ActiveTab = "overview" | "history" | "agent" | "settings";

/** Agent 聊天消息 */
export interface AgentMessage {
  id: string;
  role: "user" | "system" | "agent";
  content: string;
  keywords?: string[];
  timestamp: number;
}

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
  activeFilter: string;
  searchQuery: string;
  totalRecords: number;
  selectedIds: Set<string>;

  // ── Agent ──
  recommendations: Recommendation[];
  pendingActions: PendingAction[];
  agentProfile: AgentProfile | null;
  agentLoading: boolean;
  agentMessages: AgentMessage[];
  analysisResult: AgentAnalysisResult | null;

  // ── AI 配置 ──
  aiConfig: AiConfig | null;

  // ── UI 状态 ──
  wsConnected: boolean;
  activeTab: ActiveTab;

  // ── Actions: 数据获取 ──
  fetchWatchlist: () => Promise<void>;
  fetchRecords: (page?: number, filter?: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchGroupedStats: () => Promise<void>;

  // ── Actions: 写入操作 ──
  addWatchlistEntry: (entry: WatchlistEntry) => Promise<void>;
  removeWatchlistEntry: (domain: string) => Promise<void>;
  deleteRecordIds: (ids: string[]) => Promise<void>;
  togglePin: (
    id: string,
    pinned: number,
    score: number | null
  ) => Promise<void>;
  setTrackingEnabled: (enabled: boolean) => Promise<void>;
  clearAllRecords: () => Promise<void>;
  exportData: () => Promise<string>;

  // ── Actions: 筛选与选择 ──
  setFilter: (filter: string) => void;
  setSearchQuery: (query: string) => void;
  toggleRecordSelection: (id: string) => void;
  clearSelection: () => void;
  setActiveTab: (tab: ActiveTab) => void;

  // ── Actions: Agent ──
  triggerAnalysis: (command?: string) => Promise<void>;
  fetchRecommendations: () => Promise<void>;
  acceptRecommendation: (id: string) => Promise<void>;
  rejectRecommendation: (id: string) => Promise<void>;
  clearAllRecommendations: () => Promise<void>;
  fetchPendingActions: () => Promise<void>;
  approveActions: (ids: string[]) => Promise<void>;
  dismissActions: (ids: string[]) => Promise<void>;
  fetchAgentProfile: () => Promise<void>;
  autoClean: () => Promise<void>;

  // ── Actions: 设置 ──
  fetchAiConfig: () => Promise<void>;
  updateAiConfig: (config: AiConfig) => Promise<void>;
  testAiConnection: () => Promise<{
    ok: boolean;
    response?: string;
    error?: string;
  }>;
}

const api = () => window.electronAPI;

export const useAppStore = create<AppStore>((set, get) => ({
  // ── 初始状态 ──
  watchlist: [],
  records: [],
  stats: null,
  groupedStats: null,
  enabled: true,

  currentPage: 1,
  pageSize: 50,
  activeFilter: "all",
  searchQuery: "",
  totalRecords: 0,
  selectedIds: new Set(),

  recommendations: [],
  pendingActions: [],
  agentProfile: null,
  agentLoading: false,
  agentMessages: [],
  analysisResult: null,

  aiConfig: null,

  wsConnected: false,
  activeTab: "overview",

  // ── 数据获取 ──

  fetchWatchlist: async () => {
    const data = await api().getWatchlist();
    set({ watchlist: data });
  },

  fetchRecords: async (page, filter) => {
    const { pageSize, records: existing } = get();
    const p = page ?? get().currentPage;
    const f = filter ?? get().activeFilter;
    const result = await api().getRecordsPage(p, pageSize, f);
    // 第 1 页 (切换筛选/初始化) 替换；后续页追加 (Load more)
    const merged = p === 1 ? result.records : [...existing, ...result.records];
    set({
      records: merged,
      totalRecords: result.total,
      currentPage: p,
      activeFilter: f,
    });
  },

  fetchStats: async () => {
    const data = await api().getStatistics();
    set({ stats: data, enabled: data.enabled });
  },

  fetchGroupedStats: async () => {
    const data = await api().getStats();
    set({ groupedStats: data });
  },

  // ── 写入操作 ──

  addWatchlistEntry: async (entry) => {
    await api().addToWatchlist(entry);
    await get().fetchWatchlist();
  },

  removeWatchlistEntry: async (domain) => {
    await api().removeFromWatchlist(domain);
    await get().fetchWatchlist();
  },

  deleteRecordIds: async (ids) => {
    await api().deleteRecords(ids);
    set({ selectedIds: new Set() });
    await get().fetchRecords();
    await get().fetchStats();
  },

  togglePin: async (id, pinned, score) => {
    await api().toggleRecordPin(id, pinned, score);
    await get().fetchRecords();
  },

  setTrackingEnabled: async (enabled) => {
    await api().setEnabled(enabled);
    set({ enabled });
  },

  clearAllRecords: async () => {
    await api().clearRecords();
    set({ records: [], totalRecords: 0, selectedIds: new Set() });
    await get().fetchStats();
  },

  exportData: async () => {
    return await api().exportData();
  },

  // ── 筛选与选择 ──

  setFilter: (filter) => {
    set({ activeFilter: filter, currentPage: 1 });
    get().fetchRecords(1, filter);
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  toggleRecordSelection: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  // ── Agent ──

  triggerAnalysis: async (command) => {
    set({ agentLoading: true });
    const msgId = () => crypto.randomUUID();

    // 添加用户消息 (如果有命令)
    if (command) {
      set((s) => ({
        agentMessages: [
          ...s.agentMessages,
          { id: msgId(), role: "user", content: command, timestamp: Date.now() },
        ],
      }));
    }

    // 系统消息: 连接中
    set((s) => ({
      agentMessages: [
        ...s.agentMessages,
        { id: msgId(), role: "system", content: "Connecting to AI model...", timestamp: Date.now() },
      ],
    }));

    try {
      const analysis = await api().triggerAgentAnalysis(command || undefined);
      set({ analysisResult: analysis });

      if (analysis.error) {
        set((s) => ({
          agentMessages: [
            ...s.agentMessages,
            { id: msgId(), role: "system", content: `Analysis failed: ${analysis.error}`, timestamp: Date.now() },
          ],
        }));
      } else {
        set((s) => ({
          agentMessages: [
            ...s.agentMessages,
            {
              id: msgId(),
              role: "agent",
              content: analysis.summary,
              keywords: analysis.keywords,
              timestamp: Date.now(),
            },
          ],
        }));
        await get().fetchRecommendations();
        await get().fetchPendingActions();
        await get().fetchAgentProfile();
      }
    } catch (e) {
      set((s) => ({
        agentMessages: [
          ...s.agentMessages,
          { id: msgId(), role: "system", content: `Error: ${String(e)}`, timestamp: Date.now() },
        ],
      }));
    } finally {
      set({ agentLoading: false });
    }
  },

  fetchRecommendations: async () => {
    const data = await api().getRecommendations();
    set({ recommendations: data });
  },

  acceptRecommendation: async (id) => {
    await api().acceptRecommendation(id);
    await get().fetchRecommendations();
  },

  rejectRecommendation: async (id) => {
    await api().rejectRecommendation(id);
    await get().fetchRecommendations();
  },

  clearAllRecommendations: async () => {
    await api().clearRecommendations();
    set({ recommendations: [] });
  },

  fetchPendingActions: async () => {
    const data = await api().agentGetPending();
    set({ pendingActions: data });
  },

  approveActions: async (ids) => {
    await api().agentApproveActions(ids);
    await get().fetchPendingActions();
    await get().fetchRecords();
  },

  dismissActions: async (ids) => {
    await api().agentDismissActions(ids);
    await get().fetchPendingActions();
  },

  fetchAgentProfile: async () => {
    const data = await api().agentGetProfile();
    set({ agentProfile: data });
  },

  autoClean: async () => {
    set({ agentLoading: true });
    try {
      await api().agentAutoClean();
      await get().fetchPendingActions();
    } finally {
      set({ agentLoading: false });
    }
  },

  // ── 设置 ──

  fetchAiConfig: async () => {
    const data = await api().getAiConfig();
    set({ aiConfig: data });
  },

  updateAiConfig: async (config) => {
    await api().setAiConfig(config);
    set({ aiConfig: config });
  },

  testAiConnection: async () => {
    return await api().testAiConnection();
  },
}));
