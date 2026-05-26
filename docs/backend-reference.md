# 后端参考

> 本文档涵盖迁移中**不变**的后端系统，供开发时查阅。

---

## 数据库设计

存储位置: `{app.getPath("userData")}/tracker.db`，使用 sql.js (WASM 版 SQLite)。

### 表结构 (Phase 0~5)

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `records` | 浏览记录 | id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, dwellTime, createdAt, updatedAt, favIconUrl, description, ogImage |
| `watchlist` | 监控站点 | domain (PK), label, color, regexFilter, regexTarget |
| `settings` | 应用设置 | key (PK), value |
| `recommendations` | AI 推荐 | id, url, title, domain, groupLabel, reason, status, createdAt |
| `agent_conversations` | Agent 对话 | id, type, summary, system_prompt, created_at, completed_at |
| `agent_messages` | 对话消息 | id, conversation_id, round, role, content, tool_calls, tool_call_id, created_at |
| `agent_memories` | Agent 记忆 | id, type (preference/anti_pattern), key, value, weight, source_conversation_id, source_reflection, created_at, updated_at |
| `agent_pending_actions` | 待审批操作 | id, conversation_id, tool_name, args, reason, status (pending/approved/dismissed), created_at, resolved_at |

### 新增表 (Phase 6~8, 迁移 V2)

> 详见 [vision.md](./vision.md) 第 6 节

| 表名 | Phase | 用途 | 关键字段 |
|------|-------|------|---------|
| `interest_nodes` | 6 | 兴趣图谱节点 | id, category, subcategory, label, weight, source, embedding, last_hit_at |
| `interest_sources` | 6 | 兴趣来源追溯 | id, interest_id, record_id, platform, domain, contribution |
| `platform_mappings` | 6 | 平台↔兴趣映射 | id, platform, category, subcategory, platform_tag, platform_url, confidence |
| `platform_strategies` | 7 | 注入策略配置 | platform (PK), config_json |
| `injection_logs` | 7 | 注入操作审计 | id, platform, action_type, target_url, target_label, category |
| `discovered_content` | 8 | 内容发现结果 | id, url, title, snippet, source_type, category, relevance |
| `rec_api_config` | 8 | Rec API 配置 | key (PK), value |

> records 表扩展: `ALTER TABLE records ADD COLUMN platform TEXT DEFAULT ''`

### 关键业务逻辑

- **去重**: 同一伪装组 (Label) 下相同 Path 的记录视为同一条，更新而非新增
- **防抖**: 同一 tabId 60秒内刷新不计
- **评分**: 首次复访 → Pin +1分；跨天复访 → +1分/天
- **持久化**: 内存中操作，`markDirty()` 标脏，1秒防抖后 `flushSave()` 写盘

---

## AI Agent 系统

### 工具清单

| 工具名 | 类别 | 功能 | 对应 IPC |
|--------|------|------|----------|
| `search_records` | read | 多维搜索历史 (keyword/domain/score/limit) | — |
| `get_record_details` | read | 获取单条记录详情 | — |
| `get_statistics` | read | 获取浏览习惯分布统计 | — |
| `get_watchlist` | read | 获取监控站点列表 | — |
| `delete_records` | **write** | 批量删除记录 (需审批) | `agent-approve-actions` |
| `update_regex_rule` | **write** | 修改站点正则规则 (需审批) | `agent-approve-actions` |
| `update_record_score` | **write** | 修改记录评分 (需审批) | `agent-approve-actions` |

### Agent 执行流程

```
用户指令 (自然语言)
    │
    ▼
agentLoop() — 最多 5 轮
    │
    ├── callAI() → 构造 system/user messages
    │   ├── Ollama: 原生 tool_call 或 prompt 模拟
    │   ├── OpenAI: function calling 格式
    │   └── Anthropic: tool_use 格式
    │
    ├── 解析 tool_calls
    │   ├── read 类 → 立即执行，结果回传下一轮
    │   └── write 类 → 进入 pending 队列，返回 "queued for approval"
    │
    └── 最终回复 → 广播到前端
        │
        ▼
React AgentTab 显示待审批操作
    │
    ├── Approve → agent-approve-actions → executeApprovedActions()
    └── Dismiss → agent-dismiss-actions → 丢弃
```

### 自省系统 (Reflection)

| 触发场景 | 函数 | 学习目标 |
|----------|------|---------|
| 用户批量删除记录 | `triggerReflectionOnDelete()` | 识别被删除记录的共性 → 更新 anti_pattern 记忆 |
| 用户排斥 AI 推荐 | `triggerReflectionOnReject()` | 记录被排斥内容的特征 → 更新 preference 权重 |

### AI Provider 支持

| Provider | 端点默认值 | 特点 |
|----------|-----------|------|
| Ollama | `http://127.0.0.1:11434` | 本地推理，支持原生 tool_call + prompt 模拟回退 |
| OpenAI | 用户配置 | function calling 格式，需 API Key |
| Anthropic | 用户配置 | tool_use 格式，需 API Key |

---

## Chrome 扩展

### 双模式运行

| 模式 | 条件 | 数据存储 | AI 能力 |
|------|------|---------|---------|
| **WS 模式** | Electron 运行中 | 通过 WebSocket 实时同步到主进程 | 完整 (调用主进程 Agent) |
| **Local 模式** | Electron 离线 | `chrome.storage.local` | 轻量 (扩展内置 `callAILite()` 简单分析) |

### 事件监听

- `chrome.tabs.onUpdated` — 捕获页面 URL 变化
- `chrome.tabs.onRemoved` — 刷出停留时长 (dwellTime)
- `chrome.tabs.onActivated` — 切换活跃标签页

### 伪装归类匹配逻辑 (background.ts)

1. 遍历 Watchlist，对每个 entry 尝试匹配当前 URL domain
2. 若 entry 有 `regexFilter`，对 `regexTarget` (url/title) 做正则匹配
3. 匹配成功 → 使用 entry.label 作为伪装组名，entry.color 作为颜色
4. 记录的 `domain` 字段存储原始域名，`matchedRule` 存储伪装组 label
