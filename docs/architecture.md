# 系统架构

## 架构总览

### 当前架构 (Phase 0~5)

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 主进程 (main.js)                │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐ │
│  │ SQLite   │  │ WebSocket│  │ AI 调用   │  │ IPC Handler│ │
│  │ (sql.js) │  │ Server   │  │ Ollama/   │  │ 渲染进程通信│ │
│  │          │  │ :8766    │  │ OpenAI/   │  │            │ │
│  └────┬─────┘  └────┬─────┘  │ Anthropic │  └─────┬──────┘ │
│       │             │        └───────────┘        │        │
│  ┌────┴─────────────┴─────────────────────────────┴──────┐ │
│  │              Agent 子系统 (agent/)                      │ │
│  │  executor.js ← 执行循环  │  tools.js ← 工具注册表      │ │
│  │  reflect.js  ← 自省学习  │  (7 tools: 4 read + 3 write) │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────┬──────────────────────┬───────────────────────────┘
           │ IPC (preload.js)     │ WebSocket
           ▼                      ▼
┌──────────────────────────────┐  ┌────────────────────────────────────┐
│ Electron 渲染进程 (React)     │  │ Chrome 扩展 (Manifest V3 / Plasmo) │
│ src-renderer/                │  │ background.ts ← 事件监听+WS客户端  │
│ ┌──────────────────────────┐ │  │ popup.tsx    ← 弹出面板 (React)    │
│ │ AppShell                 │ │  │ options.tsx  ← 设置页面 (React)    │
│ │  ├─ OverviewTab          │ │  │ newtab.tsx   ← 新标签页 (可选)      │
│ │  ├─ HistoryTab           │ │  │                                    │
│ │  ├─ AgentTab             │ │  │ Local 模式: 离线时扩展自行存储于     │
│ │  └─ SettingsTab          │ │  │ chrome.storage.local               │
│ │ Zustand Store            │ │  └────────────────────────────────────┘
│ │ IPC Type Layer           │ │
│ └──────────────────────────┘ │
│ Vite 8 + React 19 + TS      │
│ Tailwind CSS + shadcn/ui    │
│ Radix UI primitives         │
└──────────────────────────────┘
```

### 愿景架构 (Phase 6~8)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Acuminata 核心引擎 (Electron 主进程)                    │
│                                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Interest     │  │ Platform     │  │ Content      │  │ Rec API        │  │
│  │ Graph        │  │ Bridge       │  │ Discovery    │  │ Server         │  │
│  │             │  │              │  │              │  │                │  │
│  │ 语义兴趣向量 │  │ 平台↔兴趣映射 │  │ 内容发现引擎 │  │ HTTP API       │  │
│  │ 分类体系    │  │ 注入策略      │  │ RSS/Crawl    │  │ 给外部推送推荐  │  │
│  │ 时序衰减    │  │ 行为模拟      │  │ 链接发现     │  │ Widget SDK     │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                  │                   │           │
│  ┌──────┴────────────────┴──────────────────┴───────────────────┴────────┐  │
│  │                    现有子系统 (不变)                                      │  │
│  │  SQLite DB │ WebSocket Server │ AI Agent │ IPC Handler │ Watchlist    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
         │ IPC                    │ WebSocket               │ HTTP API
         ▼                        ▼                         ▼
┌──────────────────┐  ┌─────────────────────────┐  ┌───────────────────────┐
│ React 渲染进程     │  │ Chrome 扩展 (增强)        │  │ 第三方网站             │
│                  │  │                         │  │                       │
│ 新增:             │  │ 新增:                    │  │ 嵌入:                 │
│ · InterestView   │  │ · Content Scripts       │  │ <script src=SDK>     │
│ · PlatformConfig │  │ · 行为注入模块            │  │                       │
│ · RecAnalytics   │  │ · 兴趣信号广播            │  │ 展示:                 │
│                  │  │                         │  │ · 个性化推荐卡片       │
│ 现有: 4 Tab      │  │ 现有: 事件采集 + WS      │  │ · "你可能感兴趣"     │
└──────────────────┘  └─────────────────────────┘  └───────────────────────┘
```

## 通信机制

| 通道 | 方向 | 协议 | 用途 |
|------|------|------|------|
| Electron IPC | 主进程 ↔ 渲染进程 | `ipcMain/ipcRenderer` (preload) | React UI 读写数据、调用 Agent |
| WebSocket | 主进程 ↔ Chrome 扩展 | `ws://127.0.0.1:8766` | 扩展实时上报访问记录、接收配置同步 |
| HTTP/HTTPS | 主进程 → AI Provider | REST API | 调用 Ollama / OpenAI / Anthropic |
| chrome.storage | 扩展内部 | Chrome API | Local 模式下离线存储 |

---

## 目录结构详解 (迁移后)

```
browser-history-tracker/
├── main.js                    # Electron 主进程 — 全部后端逻辑 (迁移不改)
├── preload.js                 # Electron preload — 暴露 electronAPI (迁移不改)
├── gencert.js                 # 开发用 HTTPS 证书生成
│
├── agent/                     # AI Agent 子系统 (迁移不改)
│   ├── tools.js               # 工具注册表 — 7 个工具定义 + 格式转换
│   ├── executor.js            # Agent 执行循环 — 多轮 Tool Calling + 审批队列
│   └── reflect.js             # 自省模块 — 删除/排斥后学习偏好
│
├── src-renderer/              # ✅ React 渲染进程 (迁移目标)
│   ├── package.json           # 独立依赖 (react 19, vite 8, tailwind, shadcn)
│   ├── vite.config.ts         # Vite 配置 — base: './' 适配 Electron file://
│   ├── tailwind.config.ts     # Tailwind 配置
│   ├── tsconfig.json          # TypeScript 配置
│   ├── components.json        # shadcn/ui 配置 (new-york style)
│   ├── index.html             # Vite 入口 HTML
│   ├── postcss.config.js      # PostCSS 配置
│   ├── src/
│   │   ├── main.tsx           # React 入口 — createRoot + StrictMode
│   │   ├── App.tsx            # 根组件 — AppShell + Tab 切换
│   │   ├── index.css          # Tailwind 全局样式 + CSS 变量 (Runway Token)
│   │   ├── electron/
│   │   │   └── api.ts         # window.electronAPI 类型声明
│   │   ├── store/
│   │   │   └── index.ts       # Zustand 全局状态 + actions
│   │   ├── hooks/
│   │   │   ├── useIpcListener.ts  # IPC 事件监听 Hook
│   │   │   └── useLocale.ts       # 国际化 Hook
│   │   ├── components/
│   │   │   ├── AppShell.tsx        # 布局壳 — Sidebar + Content Area
│   │   │   ├── Sidebar.tsx         # 4 Tab 导航
│   │   │   ├── overview/
│   │   │   │   ├── OverviewTab.tsx # 总览页
│   │   │   │   ├── StatsCards.tsx  # 统计数字卡片
│   │   │   │   ├── WatchlistPanel.tsx  # 监控站点列表
│   │   │   │   └── QuickActions.tsx    # 启用/暂停 + 导出
│   │   │   ├── history/
│   │   │   │   ├── HistoryTab.tsx  # 历史页
│   │   │   │   ├── FilterBar.tsx   # 筛选栏 + 搜索
│   │   │   │   ├── RecordList.tsx  # 记录列表 (日期分组)
│   │   │   │   └── RecordItem.tsx  # 单条记录
│   │   │   ├── agent/
│   │   │   │   ├── AgentTab.tsx    # Agent 页
│   │   │   │   ├── AgentChat.tsx   # 自然语言对话
│   │   │   │   ├── Recommendations.tsx  # AI 推荐
│   │   │   │   └── PendingActions.tsx   # 待审批操作
│   │   │   ├── settings/
│   │   │   │   ├── SettingsTab.tsx # 设置页
│   │   │   │   ├── AiConfigPanel.tsx   # AI 提供商配置
│   │   │   │   ├── LocaleSwitcher.tsx  # 语言切换
│   │   │   │   └── WatchlistEditor.tsx # 添加监控站点
│   │   │   └── ui/                # shadcn/ui 基础组件
│   │   │       ├── button.tsx
│   │   │       ├── card.tsx
│   │   │       ├── tabs.tsx
│   │   │       ├── scroll-area.tsx
│   │   │       └── ...
│   │   └── lib/
│   │       └── utils.ts       # cn() 工具函数
│   └── public/
│       ├── favicon.svg
│       └── icons.svg
│
├── ui-legacy/                 # ❌ 旧版渲染进程 (迁移完成后删除)
│   ├── index.html             # 旧版单页应用
│   └── renderer.js            # 716 行 — 待逐一迁移至 React 组件
│
├── extend/                    # Chrome 扩展 (Plasmo + React + TS, 迁移不改)
│   ├── background.ts          # Service Worker — WS 连接 + 事件监听
│   ├── popup.tsx              # 弹出面板
│   ├── options.tsx            # 设置页面 (1136行)
│   ├── newtab.tsx             # 新标签页
│   └── ...
│
├── shared/                    # 共享类型定义
│   └── types.d.ts             # WatchlistEntry, HistoryRecord 接口
│
├── locales/                   # 国际化 (112 keys)
│   ├── en.json
│   └── zh-CN.json
│
├── docs/                      # 项目文档
│   ├── plan.md                # 迁移规划索引 + 路线图
│   ├── architecture.md        # 系统架构 + 目录结构
│   ├── ipc-bridge.md          # IPC 桥接设计
│   ├── store-design.md        # Zustand 状态管理
│   ├── runway-tokens.md       # Runway 设计 Token
│   ├── main-process-adaptation.md  # 主进程适配
│   ├── backend-reference.md   # 后端参考 (DB/Agent/扩展)
│   └── constraints-and-commands.md # 约束 + 命令 + 旧版归档
│
├── package.json               # Electron 主项目 + 联合开发脚本
├── DESIGN.md                  # Runway 风格设计系统规范
├── AGENTS.md                  # Agent/Cursor 开发指引
└── README.md / README_cn.md   # 项目文档
```
