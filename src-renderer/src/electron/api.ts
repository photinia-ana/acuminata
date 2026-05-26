// IPC 类型声明 — 与 preload.js 暴露的 electronAPI 接口一一对应

// ── 基础数据类型 ──

export interface WatchlistEntry {
  domain: string;
  label: string;
  color: string;
  regexFilter?: string;
  regexTarget?: "url" | "title";
}

export interface HistoryRecord {
  id: string;
  url: string;
  title: string;
  domain: string;
  matchedRule?: string;
  tabId?: number;
  timestamp: number;
  pinned: number;
  score: number | null;
  dwellTime?: number;
  createdAt: string;
  updatedAt: string;
  favIconUrl?: string;
  description?: string;
  ogImage?: string;
}

export interface Stats {
  totalRecords: number;
  todayRecords: number;
  trackedSites: number;
  mostVisited: string;
  mostVisitedCount: number;
  domainCounts: Record<string, number>;
  enabled: boolean;
}

export interface GroupedStats {
  byDomain: Record<string, number>;
  byLabel: Record<string, number>;
  byHour: number[];
  byDay: Record<string, number>;
}

export interface AiConfig {
  provider: "ollama" | "openai" | "anthropic" | "minimax";
  ollamaEndpoint: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiEndpoint: string;
  anthropicApiKey: string;
  anthropicModel: string;
}

export interface Recommendation {
  id: string;
  url: string;
  title: string;
  domain: string;
  groupLabel: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface PendingAction {
  id: string;
  conversation_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
  resolved_at?: string;
}

export interface AgentProfile {
  preferences: Array<{ key: string; value: string; weight: number }>;
  antiPatterns: Array<{ key: string; value: string; weight: number }>;
}

export interface AgentAnalysisResult {
  summary: string;
  keywords: string[];
  recordsAnalyzed: number;
  pendingActions: number;
  error?: string;
}

// ── electronAPI 接口 ──

export interface ElectronAPI {
  // 数据读写
  getWatchlist: () => Promise<WatchlistEntry[]>;
  getRecords: () => Promise<HistoryRecord[]>;
  getRecordsPage: (
    page: number,
    pageSize: number,
    filter: string
  ) => Promise<{ records: HistoryRecord[]; total: number }>;
  deleteRecords: (ids: string[]) => Promise<void>;
  toggleRecordPin: (
    id: string,
    pinned: number,
    score: number | null
  ) => Promise<void>;
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
  testAiConnection: () => Promise<{
    ok: boolean;
    response?: string;
    error?: string;
    provider: string;
  }>;

  // Agent
  triggerAgentAnalysis: (command?: string) => Promise<AgentAnalysisResult>;
  getRecommendations: () => Promise<Recommendation[]>;
  rejectRecommendation: (id: string) => Promise<boolean>;
  acceptRecommendation: (id: string) => Promise<boolean>;
  clearRecommendations: () => Promise<boolean>;
  agentGetPending: () => Promise<PendingAction[]>;
  agentApproveActions: (ids: string[]) => Promise<void>;
  agentDismissActions: (ids: string[]) => Promise<void>;
  agentGetProfile: () => Promise<AgentProfile>;
  agentAutoClean: () => Promise<void>;

  // 事件监听 — R5.4 返回 listenerId，可通过 removeListener 移除
  onUpdate: (callback: (data: unknown) => void) => symbol;
  onWatchlistUpdate: (callback: (data: unknown) => void) => symbol;
  removeListener: (channel: "data-update" | "watchlist-update", id: symbol) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
