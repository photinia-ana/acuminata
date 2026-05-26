# Acuminata 项目规划

> 版本: v2 | 最后更新: 2025-07
> 项目定位: **跨平台兴趣同步引擎 + 外挂推荐基础设施**

---

## 项目愿景

Acuminata 不只是浏览器历史追踪器，而是让用户**拥有自己的兴趣图谱**，实现：

1. **跨平台推荐同步** — B站看了军事，抖音接着看军事，兴趣随身走
2. **外挂推荐系统** — 给没有推荐能力的小网站装上推荐大脑

详见 → [vision.md](./vision.md)

---

## 专题文档索引

| 文档 | 内容 |
|------|------|
| [vision.md](./vision.md) | 🆕 产品愿景 — 跨平台兴趣引擎 + 外挂推荐系统 |
| [architecture.md](./architecture.md) | 系统架构图、通信机制、目录结构详解 |
| [ipc-bridge.md](./ipc-bridge.md) | IPC 桥接设计 — 类型声明、事件 Hook、通道完整清单 |
| [store-design.md](./store-design.md) | Zustand 状态管理 — Store 接口、Actions、数据流 |
| [runway-tokens.md](./runway-tokens.md) | Runway 设计系统 → Tailwind CSS Token 映射 |
| [main-process-adaptation.md](./main-process-adaptation.md) | 主进程适配点 — createWindow、脚本、electron-builder |
| [backend-reference.md](./backend-reference.md) | 后端参考 — 数据库设计、AI Agent 系统、Chrome 扩展 |
| [constraints-and-commands.md](./constraints-and-commands.md) | 关键约束、开发命令速查、旧版规划归档 |

---

## 路线图总览

```
Phase 0 ✅     Phase 1~5 ✅        Phase 6~8 🆕
基础设施       React 功能迁移       跨平台 + 外挂推荐
─────────────────────────────────────────────────
R0.1~R0.7     R1~R5 迁移任务      V6~V8 愿景任务
```

---

## Phase 0: 基础设施 ✅

> 目标: 搭建 React 渲染进程骨架，确保 Electron 能正常加载

| 任务 | 描述 | 状态 |
|------|------|------|
| **R0.1** 清理 Vite 模板 | 删除 App.tsx 中的 hero/logo/counter，替换为空白 AppShell | ✅ |
| **R0.2** Tailwind 主题适配 | 将 index.css CSS 变量改为 Runway 极黑 token | ✅ |
| **R0.3** IPC 类型声明 | 创建 `src/electron/api.ts`，声明 `window.electronAPI` 类型 | ✅ |
| **R0.4** Zustand Store | 创建 `src/store/index.ts`，定义状态结构和 actions | ✅ |
| **R0.5** AppShell 布局 | 创建 `AppShell.tsx` + `Sidebar.tsx`，4 Tab 切换 | ✅ |
| **R0.6** useIpcListener Hook | 封装 IPC 事件监听生命周期 | ✅ |
| **R0.7** 端到端验证 | `npm start` 能启动，Tab 切换正常，IPC 通信正常 | ✅ |

---

## Phase 1: 功能迁移 — Overview Tab

> 对应 `ui-legacy/renderer.js` 中的 `renderStats()`, `renderWatchlist()`

| 任务 | 描述 | 状态 |
|------|------|------|
| **R1.1** StatsCards | 统计数字卡片 (total / today / sites / enabled) | ✅ |
| **R1.2** WatchlistPanel | 监控站点列表 + 删除按钮 + 域名颜色指示 | ✅ |
| **R1.3** QuickActions | 启用/暂停追踪 + 导出数据 | ✅ |
| **R1.4** 数据刷新 | `onUpdate` / `onWatchlistUpdate` 监听 → store 更新 | ✅ |
| **R1.5** WS 状态指示 | Header 中显示连接状态 (绿/红点) | ✅ |

---

## Phase 2: 功能迁移 — History Tab

> 对应 `ui-legacy/renderer.js` 中的记录列表、筛选、分页

| 任务 | 描述 | 状态 |
|------|------|------|
| **R2.1** FilterBar | 搜索框 + 伪装组筛选 + 日期范围 | ✅ |
| **R2.2** RecordList | 日期分组的记录列表 + 虚拟滚动 | ✅ |
| **R2.3** RecordItem | 单条记录: 标题/域名/时间/评分/Pin/缩略图 | ✅ |
| **R2.4** 批量操作 | 多选 + 批量删除 | ✅ |
| **R2.5** Pin / 评分 | 单条记录的 Pin 切换和评分 | ✅ |
| **R2.6** 打开 URL | 点击记录调用 `openUrl` | ✅ |

---

## Phase 3: 功能迁移 — Agent Tab

> 对应 `ui-legacy/renderer.js` 中的 Agent 对话、推荐、审批

| 任务 | 描述 | 状态 |
|------|------|------|
| **R3.1** AgentChat | 自然语言输入 + 消息流显示 | ✅ |
| **R3.2** Recommendations | AI 推荐列表 (吸收/排斥) | ✅ |
| **R3.3** PendingActions | 待审批操作队列 (批准/忽略) | ✅ |
| **R3.4** AgentProfile | 用户画像展示 | ✅ |
| **R3.5** AutoClean | 触发自动清理 | ✅ |

---

## Phase 4: 功能迁移 — Settings Tab

> 对应 `ui-legacy/renderer.js` 中的设置面板

| 任务 | 描述 | 状态 |
|------|------|------|
| **R4.1** AiConfigPanel | AI 提供商选择 + API Key + 模型 + 测试连接 | ✅ |
| **R4.2** LocaleSwitcher | 语言切换 (zh-CN / en) | ✅ |
| **R4.3** DataManagement | 清空记录 + 导出 JSON | ✅ |
| **R4.4** WatchlistEditor | 添加监控站点 (domain + label + color + regex) | ✅ |

---

## Phase 5: 收尾与优化 ✅

| 任务 | 描述 | 状态 |
|------|------|------|
| **R5.1** 国际化完善 | 所有硬编码中文替换为 locale keys | ✅ |
| **R5.2** 键盘快捷键 | Tab 切换 (Ctrl+1~4)、全局搜索等 | ✅ |
| **R5.3** Toast 通知 | 替换 `showToast()` 为 React 组件 | ✅ |
| **R5.4** preload 增强 | 添加 removeListener，修复事件泄漏 | ✅ |
| **R5.5** 清理 ui-legacy | 确认功能对等后删除 `ui-legacy/` | ✅ |
| **R5.6** 生产构建验证 | `npm run build` → electron-builder 打包测试 | ✅ |

---

## Phase 6: 兴趣图谱 🆕

> 目标: 将 keywords[] 升级为结构化兴趣图谱，为跨平台同步和外挂推荐奠定数据基础
> 依赖: Phase 1~5 完成 (React 迁移完毕)

| 任务 | 描述 | 状态 | 涉及文件 |
|------|------|------|---------|
| **V6.1** DB 迁移 V2 | 新增 interest_nodes / interest_sources / platform_mappings 表; records 加 platform 字段 | ⬜ | main.js (initDatabase) |
| **V6.2** 平台自动识别 | Chrome 扩展上报记录时, 根据 domain 自动填充 platform 字段 | ⬜ | extend/background.ts |
| **V6.3** 兴趣提取 Agent 工具 | 新增 extract_interests / get_interest_graph / merge_interests / suggest_platform_mapping 工具 | ⬜ | agent/tools.js, agent/executor.js |
| **V6.4** 兴趣合并与衰减 | 兴趣节点权重累加 + 时序衰减 Job + inactive 标记 | ⬜ | main.js (新增模块) |
| **V6.5** InterestTab UI | 兴趣图谱可视化 (分类列表 + 力导向图) + 兴趣节点卡片 | ⬜ | src-renderer/src/components/interest/ |
| **V6.6** IPC 扩展 | 新增 get-interest-graph / extract-interests / merge-interests / suggest-mapping 等通道 | ⬜ | main.js, preload.js, api.ts, store |
| **V6.7** 兴趣手动管理 | 用户新增/删除/合并兴趣节点, 调整权重, 查看来源 | ⬜ | InterestTab 子组件 |
| **V6.8** 自动提取触发 | 每积累 N 条新记录自动触发兴趣提取 (可配置) | ⬜ | main.js |

---

## Phase 7: 跨平台推荐同步 🆕

> 目标: 建立平台↔兴趣映射, 通过 Content Script 将兴趣信号注入目标平台推荐流
> 依赖: Phase 6 完成 (兴趣图谱可用)

| 任务 | 描述 | 状态 | 涉及文件 |
|------|------|------|---------|
| **V7.1** Platform Strategy 数据层 | platform_strategies / injection_logs 表 + 策略 CRUD | ⬜ | main.js |
| **V7.2** 平台映射管理 UI | PlatformMappingPanel + PlatformStrategyForm | ⬜ | src-renderer/src/components/interest/ |
| **V7.3** Bridge Core | Content Script 通用桥接核心 — 兴趣信号解析 + 注入调度 | ⬜ | extend/contents/bridge-core.ts |
| **V7.4** B站注入 | bilibili-inject.ts — 分区浏览 + 话题点击模拟 | ⬜ | extend/contents/bilibili-inject.ts |
| **V7.5** 抖音注入 | douyin-inject.ts — 话题标签浏览 + 搜索注入 | ⬜ | extend/contents/douyin-inject.ts |
| **V7.6** 通用注入 | generic-inject.ts — 搜索建议 + 兴趣卡片 (非侵入式) | ⬜ | extend/contents/generic-inject.ts |
| **V7.7** 注入审计与日志 | 所有注入操作记录到 injection_logs, InjectionLogViewer UI | ⬜ | main.js + InterestTab |
| **V7.8** WS 协议扩展 | 扩展 WebSocket 协议, 支持兴趣信号下发 + 注入策略同步 | ⬜ | main.js, extend/background.ts |
| **V7.9** 安全与速率控制 | maxDailyActions / cooldownMs / 操作限流 | ⬜ | bridge-core.ts + main.js |

---

## Phase 8: 外挂推荐系统 🆕

> 目标: 提供 Rec API Server + Widget SDK, 让任何网站获得个性化推荐能力
> 依赖: Phase 6 完成 (兴趣图谱可用); Phase 7 可选

| 任务 | 描述 | 状态 | 涉及文件 |
|------|------|------|---------|
| **V8.1** Rec API Server | Express/Fastify HTTP 服务, 端口 8767 — recommendations / interests / events / health | ⬜ | 新目录 server/ |
| **V8.2** 推荐生成算法 | 基于兴趣图谱 + 内容发现, 生成个性化推荐列表 | ⬜ | server/algorithms/ |
| **V8.3** 内容发现引擎 | RSS 订阅 + HN/Reddit API + 链接图 + AI 搜索 | ⬜ | server/discovery/ |
| **V8.4** discovered_content 管理 | 发现内容 CRUD + 展示/点击追踪 + 定期清理 | ⬜ | main.js |
| **V8.5** Widget SDK | 独立 JS 包 — 一行代码接入, 自动拉取推荐, 渲染卡片 | ⬜ | 新目录 packages/widget/ |
| **V8.6** DiscoveryTab UI | 发现内容流 + Rec API 状态 + Widget 代码生成 + 源配置 | ⬜ | src-renderer/src/components/discovery/ |
| **V8.7** 安全模型 | localhost 监听 + CORS 白名单 + 速率限制 | ⬜ | server/ |
| **V8.8** Sidebar 扩展 | 4 Tab → 6 Tab (新增 Interest + Discovery) | ⬜ | Sidebar.tsx, store |

---

## 阶段依赖关系

```
Phase 0 ✅ ──→ Phase 1~5 (React 迁移, 可并行)
                     │
                     ▼
              Phase 6 (兴趣图谱) ← 数据基础
                     │
              ┌──────┴──────┐
              ▼             ▼
        Phase 7         Phase 8
      (跨平台同步)     (外挂推荐)
              │             │
              └──────┬──────┘
                     ▼
               Phase 9 (未来)
              发布与生态
```

> Phase 7 和 Phase 8 可并行开发, 两者都依赖 Phase 6 的兴趣图谱, 但彼此独立。
