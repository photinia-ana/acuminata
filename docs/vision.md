# Acuminata 产品愿景 — 跨平台兴趣引擎与外挂推荐系统

> 版本: v2 | 最后更新: 2025-07
> 定位: 从「浏览器历史追踪器」升级为「跨平台兴趣同步引擎 + 外挂推荐基础设施」

---

## 1. 核心产品命题

Acuminata 要解决两个痛点：

### 痛点 A：跨平台推荐断裂

> 我在 B 站看了大量军事内容，打开抖音却从零开始，平台推荐全是娱乐八卦。

每个平台的推荐算法各自为政，用户画像被锁死在平台内部。用户无法把自己的兴趣"带过去"。

**Acuminata 的解法**：建立用户自己拥有的兴趣图谱（Interest Graph），通过 Chrome 扩展的 Content Script 注入目标平台，将统一兴趣信号注入平台推荐流，实现"兴趣随身走"。

### 痛点 B：小网站无推荐能力

> 很多好用的独立站、论坛、工具站没有任何推荐系统，全靠用户自己翻。

中小站点无力自建推荐系统，用户要么大海捞针，要么错过好内容。

**Acuminata 的解法**：提供"外挂推荐引擎"——小网站嵌入一行 JS SDK，即可获得基于 Acuminata 兴趣图谱的个性化推荐。相当于给任何网站装上推荐大脑。

---

## 2. 能力架构

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

---

## 3. 兴趣图谱 (Interest Graph)

### 3.1 设计理念

现有的 `keywords[]` + `agent_memories` 太粗，无法支撑跨平台推荐。需要升级为结构化的兴趣图谱：

| 层级 | 现有 | 升级后 |
|------|------|--------|
| 兴趣表示 | `keywords: string[]` | `InterestVector`: 带权重的分类标签 + 可选嵌入向量 |
| 时间感知 | 无衰减 | 时序衰减：近期行为权重高，长期行为缓慢衰减 |
| 来源追踪 | 无 | 每个兴趣节点记录来源平台、来源记录 |
| 语义理解 | 关键词匹配 | AI 提取语义分类（军事→国防/武器/地缘政治子类） |

### 3.2 数据模型

#### 新增表: `interest_nodes`

```sql
CREATE TABLE interest_nodes (
  id            TEXT PRIMARY KEY,           -- 'int_' + timestamp + random
  category      TEXT NOT NULL,              -- 一级分类: 军事/科技/游戏/...
  subcategory   TEXT,                       -- 二级分类: 武器装备/地缘政治/...
  label         TEXT NOT NULL,              -- 人类可读标签: "现代战机"
  weight        REAL NOT NULL DEFAULT 1.0,  -- 权重 0.0~2.0, 衰减后可能 <1.0
  source        TEXT NOT NULL DEFAULT 'auto', -- 'auto'(AI提取) | 'manual'(用户手动)
  embedding     TEXT,                       -- JSON array, 语义向量 (可选, 预留)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_hit_at   INTEGER NOT NULL            -- 最近一次命中时间, 用于衰减计算
);
```

#### 新增表: `interest_sources`

```sql
CREATE TABLE interest_sources (
  id            TEXT PRIMARY KEY,
  interest_id   TEXT NOT NULL REFERENCES interest_nodes(id),
  record_id     TEXT,                       -- 来源浏览记录 (可为空)
  platform      TEXT NOT NULL DEFAULT '',    -- 来源平台: bilibili/douyin/weibo/...
  domain        TEXT NOT NULL DEFAULT '',    -- 来源域名
  contribution  REAL NOT NULL DEFAULT 1.0,  -- 该来源对此兴趣的贡献度
  created_at    INTEGER NOT NULL
);
```

#### 新增表: `platform_mappings`

```sql
CREATE TABLE platform_mappings (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,              -- bilibili/douyin/weibo/zhihu/...
  category      TEXT NOT NULL,              -- 兴趣一级分类
  subcategory   TEXT,                       -- 兴趣二级分类
  platform_tag  TEXT NOT NULL,              -- 平台对应的话题/分区/标签 ID
  platform_url  TEXT,                       -- 平台话题页 URL (便于验证)
  confidence    REAL NOT NULL DEFAULT 0.8,  -- 映射置信度
  verified      INTEGER NOT NULL DEFAULT 0, -- 是否人工验证
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

#### records 表扩展字段

```sql
ALTER TABLE records ADD COLUMN platform TEXT DEFAULT '';
-- platform: 由 Chrome 扩展根据域名自动识别, 或用户手动标注
-- bilibili.com → 'bilibili', douyin.com → 'douyin', ...
```

### 3.3 兴趣提取流程

```
浏览记录 (records)
    │
    ├── 批量触发 (每 N 条新记录 / 用户手动)
    │
    ▼
AI 兴趣提取 (Agent 新工具: extract_interests)
    │  输入: 最近 N 条记录的 title + url + domain + platform
    │  输出: [{category, subcategory, label, weight, source_platform}]
    │
    ▼
兴趣合并 (Merge Logic)
    │  · 同 category+subcategory+label → 权重累加, last_hit_at 更新
    │  · 新 label → 新建节点, weight = 1.0
    │  · 记录来源 → interest_sources 关联
    │
    ▼
时序衰减 (Decay Job, 每日一次)
    │  · last_hit_at 超过 7 天 → weight *= 0.95
    │  · last_hit_at 超过 30 天 → weight *= 0.8
    │  · weight < 0.1 → 标记为 inactive (不删除, 保留历史)
    │
    ▼
Interest Graph 就绪
```

### 3.4 Agent 新工具

| 工具名 | 类别 | 功能 | 说明 |
|--------|------|------|------|
| `extract_interests` | write | 从浏览记录批量提取兴趣节点 | 需审批: 会修改兴趣图谱 |
| `get_interest_graph` | read | 获取当前兴趣图谱 (支持按 category/platform 筛选) | — |
| `merge_interests` | write | 合并/拆分兴趣节点 (手动微调) | 需审批 |
| `suggest_platform_mapping` | write | AI 建议平台话题映射 | 需审批 |

---

## 4. 跨平台推荐同步 (Platform Bridge)

### 4.1 工作原理

```
Interest Graph (本机)
    │
    ▼
平台映射 (platform_mappings)
    │  军事 → B站「军事分区」、抖音「军事话题」、微博「军事超话」
    │
    ▼
注入策略 (Per-Platform Strategy)
    │
    ├── 方式 A: 行为注入 (Content Script)
    │   在目标平台页面注入脚本, 模拟用户对相关内容的浏览行为
    │   · 自动点击/停留相关话题标签
    │   · 滚动浏览相关推荐区域
    │   · 平台推荐算法会捕获这些行为, 调整推荐
    │
    ├── 方式 B: 搜索注入
    │   在目标平台搜索框自动填入兴趣关键词
    │   · 打开平台时, 根据兴趣图谱生成搜索建议
    │   · 用户点击后, 平台记录搜索行为, 影响推荐
    │
    └── 方式 C: 兴趣卡片 (非侵入式)
        · 在平台页面侧边/顶部显示 Acuminata 兴趣卡片
        · "根据你的跨平台兴趣, 你可能想看: ..."
        · 不修改平台行为, 纯信息辅助
```

### 4.2 Content Script 架构

Chrome 扩展新增 `contents/` 目录：

```
extend/
├── contents/
│   ├── bridge-core.ts         # 通用桥接核心 — 兴趣信号解析 + 注入调度
│   ├── bilibili-inject.ts     # B站注入 — 分区浏览 + 话题点击
│   ├── douyin-inject.ts       # 抖音注入 — 话题标签浏览 + 搜索
│   ├── weibo-inject.ts        # 微博注入 — 超话关注 + 话题浏览
│   └── generic-inject.ts      # 通用注入 — 搜索建议 + 兴趣卡片
```

### 4.3 注入策略配置

每个平台有独立的注入策略, 存储在 `settings` 表中:

```typescript
interface PlatformStrategy {
  platform: string;                // 'bilibili' | 'douyin' | ...
  enabled: boolean;
  mode: 'behavior' | 'search' | 'card' | 'combined';
  intensity: 'gentle' | 'moderate' | 'aggressive';
  // gentle: 仅搜索建议, 不自动操作
  // moderate: 自动浏览相关话题 + 搜索建议
  // aggressive: 自动点击 + 停留 + 滚动
  maxDailyActions: number;        // 每日最大自动操作数 (防封)
  cooldownMs: number;             // 操作间最小间隔
  categories: string[];           // 激活的兴趣分类
}
```

### 4.4 隐私与安全

| 原则 | 实现 |
|------|------|
| 用户知情 | 每个平台的注入模式必须用户手动开启, 默认关闭 |
| 可控速率 | `maxDailyActions` + `cooldownMs` 防止异常行为 |
| 透明日志 | 所有注入操作记录到 `injection_log` 表, 用户可审查 |
| 仅修改推荐 | 不操作任何用户数据 (不发帖/不关注/不收藏), 仅影响推荐算法输入 |
| 本地优先 | 兴趣图谱仅存本机, 不上传云端 |

---

## 5. 外挂推荐系统 (Rec API + Widget SDK)

### 5.1 架构

```
Acuminata 主进程
    │
    ├── Rec API Server (Express/Fastify, 端口 8767)
    │   │
    │   ├── GET  /api/v1/recommendations?site=xxx&limit=10
    │   │   → 基于兴趣图谱, 为指定站点生成推荐
    │   │
    │   ├── GET  /api/v1/interests?category=xxx
    │   │   → 查询兴趣图谱 (供 Widget 定制化)
    │   │
    │   ├── POST /api/v1/events
    │   │   → 接收 Widget 端用户行为 (点击/停留), 反馈到兴趣图谱
    │   │
    │   └── GET  /api/v1/health
    │       → 健康检查
    │
    └── Widget SDK (@acuminata/widget)
        │
        ├── <script src="http://localhost:8767/sdk.js"
        │         data-site="example.com"
        │         data-limit="5"
        │         data-theme="dark">
        │
        ├── 渲染推荐卡片 → 用户点击 → POST /events → 兴趣图谱增强
        │
        └── 无需后端, 纯前端 JS, 小网站一行代码接入
```

### 5.2 推荐生成算法

```
输入:
  - 目标站点 domain
  - 用户兴趣图谱 (interest_nodes + interest_sources)
  - 内容发现源 (见 5.3)

步骤:
  1. 筛选: 从兴趣图谱取 weight > 0.3 的活跃节点
  2. 关联: 查找这些兴趣的 interest_sources, 获取相关 records
  3. 发现: 调用内容发现引擎, 找到兴趣相关的新内容
  4. 排序: 按 weight × recency × diversity 综合打分
  5. 去重: 排除用户已访问过的 URL

输出:
  - 推荐列表 [{url, title, reason, category, score}]
  - reason 生成: "因为你在 B站对[军事]感兴趣"
```

### 5.3 内容发现源

| 源 | 方式 | 适用场景 |
|------|------|---------|
| **RSS 订阅** | 定时拉取 RSS Feed, 按兴趣关键词过滤 | 博客、新闻站 |
| **Hacker News API** | 公开 API, 按兴趣分类匹配 | 科技类 |
| **Reddit API** | Subreddit 匹配兴趣分类 | 通用 |
| **链接发现** | 从已有记录中提取外链, 沿链接图扩展 | 通用 |
| **AI 生成搜索** | 根据兴趣图谱生成搜索词, 调用搜索引擎 | 兜底 |

内容发现的结果存入新表:

```sql
CREATE TABLE discovered_content (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  snippet       TEXT,                       -- 摘要
  source_type   TEXT NOT NULL,              -- 'rss' | 'api' | 'link_graph' | 'ai_search'
  source_url    TEXT,                       -- 发现来源 URL
  category      TEXT,                       -- 匹配的兴趣分类
  relevance     REAL NOT NULL DEFAULT 0.5,  -- 相关度
  discovered_at INTEGER NOT NULL,
  shown_at      INTEGER,                   -- 首次展示给用户的时间
  clicked_at    INTEGER                    -- 用户点击时间
);
```

### 5.4 Widget SDK 设计

```html
<!-- 小网站接入, 一行代码 -->
<div id="acuminata-recs"></div>
<script
  src="http://localhost:8767/sdk.js"
  data-site="myawesomesite.com"
  data-limit="5"
  data-theme="dark"
  data-categories="tech,science"
></script>
```

SDK 功能:
- 自动检测 `data-site`, 请求推荐 API
- 渲染推荐卡片 (支持 dark/light 主题)
- 用户点击 → POST `/events` → 反馈到兴趣图谱
- 支持自定义模板 (高级用法)

### 5.5 安全模型

| 层 | 措施 |
|------|------|
| API 认证 | 本地服务, 默认仅监听 127.0.0.1 |
| CORS | 仅允许配置的站点域名 |
| 速率限制 | 每站点每分钟最大请求数 |
| 数据隔离 | Widget 只能看到推荐结果, 不暴露完整兴趣图谱 |
| 隐私 | 推荐理由不暴露跨平台来源细节 (只说"基于你的兴趣") |

---

## 6. DB 迁移方案

所有新表通过版本化迁移添加, 不修改现有表结构 (仅 `records` 加 `platform` 字段):

```sql
-- Migration V2: Interest Graph + Platform Bridge + Rec API

-- 1. records 表扩展
ALTER TABLE records ADD COLUMN platform TEXT DEFAULT '';

-- 2. 兴趣图谱
CREATE TABLE interest_nodes ( ... );      -- 见 3.2
CREATE TABLE interest_sources ( ... );    -- 见 3.2
CREATE TABLE platform_mappings ( ... );   -- 见 3.2

-- 3. 跨平台桥接
CREATE TABLE platform_strategies (        -- 注入策略持久化
  platform      TEXT PRIMARY KEY,
  config_json   TEXT NOT NULL,             -- JSON: PlatformStrategy
  updated_at    INTEGER NOT NULL
);

CREATE TABLE injection_logs (             -- 注入操作审计日志
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,
  action_type   TEXT NOT NULL,             -- 'click' | 'scroll' | 'search' | 'browse'
  target_url    TEXT,
  target_label  TEXT,
  category      TEXT,
  created_at    INTEGER NOT NULL
);

-- 4. 内容发现与外挂推荐
CREATE TABLE discovered_content ( ... );  -- 见 5.3

-- 5. Rec API 配置
CREATE TABLE rec_api_config (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);
-- 默认配置: port=8767, enabled=true, corsOrigins='*', rateLimit=60
```

---

## 7. 新增 IPC 通道

### 兴趣图谱

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `get-interest-graph` | R→M | `{category?, platform?, minWeight?}` | `InterestNode[]` |
| `extract-interests` | R→M | `{recordIds?, force?}` | `{nodesCreated, nodesUpdated}` |
| `merge-interests` | R→M | `{sourceId, targetId}` | `void` |
| `delete-interest` | R→M | `{id}` | `void` |
| `get-platform-mappings` | R→M | `{platform?}` | `PlatformMapping[]` |
| `suggest-mapping` | R→M | `{platform, category}` | `PlatformMapping[]` |
| `save-mapping` | R→M | `PlatformMapping` | `void` |

### 跨平台桥接

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `get-platform-strategies` | R→M | — | `PlatformStrategy[]` |
| `update-platform-strategy` | R→M | `PlatformStrategy` | `void` |
| `get-injection-logs` | R→M | `{platform?, limit?}` | `InjectionLog[]` |
| `trigger-platform-sync` | R→M | `{platform}` | `{actionsPerformed}` |

### 外挂推荐

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `get-rec-api-status` | R→M | — | `{running, port, requests}` |
| `toggle-rec-api` | R→M | `{enabled}` | `void` |
| `get-discovered-content` | R→M | `{category?, limit?}` | `DiscoveredContent[]` |
| `trigger-content-discovery` | R→M | `{sourceType?}` | `{itemsFound}` |

---

## 8. React UI 新增组件

### 新增 Tab: 兴趣 (InterestTab)

```
src-renderer/src/components/
├── interest/
│   ├── InterestTab.tsx           # 兴趣页主容器
│   ├── InterestGraphView.tsx     # 兴趣图谱可视化 (力导向图/分类列表)
│   ├── InterestNodeCard.tsx      # 单个兴趣节点 — 类别/权重/来源/衰减
│   ├── PlatformMappingPanel.tsx  # 平台映射管理
│   ├── PlatformStrategyForm.tsx  # 注入策略配置
│   └── InjectionLogViewer.tsx    # 注入操作日志
```

### 新增 Tab: 发现 (DiscoveryTab)

```
src-renderer/src/components/
├── discovery/
│   ├── DiscoveryTab.tsx          # 发现页主容器
│   ├── ContentFeed.tsx           # 发现内容流 (卡片列表)
│   ├── RecApiStatus.tsx          # Rec API 运行状态
│   ├── WidgetCodeSnippet.tsx     # Widget SDK 接入代码生成
│   └── SourceConfigPanel.tsx     # 内容发现源配置 (RSS/API)
```

### Sidebar 扩展

现有 4 Tab → 6 Tab:

```typescript
activeTab: 'overview' | 'history' | 'agent' | 'interest' | 'discovery' | 'settings'
```

---

## 9. 技术依赖新增

| 包 | 用途 | 安装位置 |
|------|------|---------|
| `express` 或 `fastify` | Rec API HTTP Server | 根 package.json |
| `cors` | Rec API CORS | 根 package.json |
| `rate-limit` | Rec API 速率限制 | 根 package.json |
| `rss-parser` | RSS 内容发现 | 根 package.json |
| `d3-force` (可选) | 兴趣图谱力导向可视化 | src-renderer |
| `@acuminata/widget` | Widget SDK (独立 npm 包) | 新目录 `packages/widget/` |

---

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 平台反爬/封号 | 高 | gentle 模式默认, 速率限制, 操作审计日志 |
| Content Script 注入被平台检测 | 中 | 仅模拟合法用户行为 (点击/滚动/搜索), 不修改 DOM 结构 |
| 兴趣提取 AI 幻觉 | 中 | extract_interests 需用户审批, 权重可手动调整 |
| Rec API 被滥用 | 低 | 仅监听 localhost, CORS 白名单, 速率限制 |
| 数据库膨胀 (新表) | 低 | discovered_content 定期清理, interest_nodes 衰减至 inactive |
| Chrome 扩展权限 | 中 | Manifest V3 对 Content Script 有限制, 需声明 host_permissions |
