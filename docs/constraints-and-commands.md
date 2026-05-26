# 关键约束、开发命令与旧版归档

---

## 关键约束与注意事项

| 约束 | 说明 |
|------|------|
| sql.js 异步 | 数据库初始化是 async 的，所有后续操作需在 `initDatabase()` 完成后 |
| 单实例锁 | `requestSingleInstanceLock` 确保只有一个 Electron 实例 |
| CSP 限制 | Chrome 扩展 CSP 阻止外部字体加载，使用 `system-ui` + `JetBrains Mono` fallback |
| Plasmo 约定 | 入口文件按命名自动检测: `background.ts`, `popup.tsx`, `options.tsx` |
| 同步 DB | sql.js 查询是同步的 (内存数据库)，但 save 到磁盘是异步的 |
| 双 package.json | 根目录 (Electron) 和 `src-renderer/` (Vite) 独立安装依赖 |
| 扩展 API Key | 扩展 Local 模式的 AI 调用也走用户配置的 Key，但能力有限 (无 Agent Loop) |
| Vite base | `base: "./"` 是 Electron `file://` 协议必需的，不能改为 `/` |
| preload 限制 | `contextBridge` 只能传基本类型和 Promise，不能传函数/类实例 |
| HMR 跨进程 | 开发时 Vite dev server (5173) + Electron 主进程并发启动，需 `wait-on` |
| 事件监听泄漏 | 当前 preload 未暴露 removeListener，React 组件卸载时无法清理 ipcRenderer 监听 |

---

## 开发命令速查

```bash
# ── Electron + React 渲染进程 (联合开发) ──
npm start              # 启动 Vite HMR + Electron (concurrently)

# ── 仅 React 渲染进程 ──
cd src-renderer/
npm install            # 安装渲染进程依赖
npm run dev            # Vite 开发服务器 (http://localhost:5173)
npm run build          # 生产构建 → src-renderer/dist/
npx tsc --noEmit       # 仅类型检查

# ── 生产构建 ──
npm run build          # 渲染进程构建 + Electron 打包

# ── Chrome 扩展 ──
cd extend/
npm install            # 安装扩展依赖
npm run dev            # 开发模式 (HMR)
npm run build          # 生产构建 → build/chrome-mv3-prod/

# ── 加载扩展 ──
# Chrome → 扩展管理 → 开发者模式 → 加载已解压的扩展 → 选择 extend/build/chrome-mv3-prod/
```

---

## 旧版规划归档

以下为迁移前的原始演进路线图，React 迁移完成后按新规划推进：

<details>
<summary>📋 原始 Phase 1~4 路线图 (点击展开)</summary>

### Phase 1: 稳基 (Stabilize)

| 任务 | 描述 | 预估 | 迁移后状态 |
|------|------|------|-----------|
| **M1** 拆分 main.js | 按职责拆分为: `db.js`, `ws-server.js`, `ipc-handlers.js`, `ai-providers.js`, `agent-tool-handlers.js`, `settings.js`, `locale.js` | 3d | 迁移后仍需 |
| **M2** 拆分 renderer.js | 提取: `state.js`, `api.js`, `components/` | 2d | **已由 React 迁移替代** |
| **M3** 拆分 options.tsx | 提取 React 组件: `WatchlistPanel`, `RecordList`, `AgentPanel`, `SettingsPanel` | 1d | 迁移后仍需 |
| **M4** 添加测试 | 数据库 CRUD、Agent 工具执行、IPC handler、正则匹配逻辑 | 3d | 迁移后仍需 |
| **M5** 输入校验 | IPC 参数 schema 校验、Watchlist domain 格式验证 | 1d | 迁移后仍需 |
| **M6** 清理遗留 | ~~删除 `src-renderer/`~~ → **`src-renderer/` 已成为主渲染进程**，改为删除 `ui-legacy/` | 0.5d | R5.5 覆盖 |

### Phase 2: 增强 (Enhance)

| 任务 | 描述 | 预估 |
|------|------|------|
| **E1** 全量 i18n | 消除硬编码中文，统一走 locales | 1d |
| **E2** Agent 对话历史 | React 组件显示完整对话流 (含思维链广播) | 2d |
| **E3** 数据可视化 | 按日/周/月浏览热力图、域名分布饼图 | 2d |
| **E4** WS 指数退避 | 扩展断连重连采用指数退避 + 抖动 | 0.5d |
| **E5** 记忆过期策略 | agent_memories 超过 90 天自动降权/清理 | 0.5d |
| **E6** 结构化日志 | 统一 log level (debug/info/warn/error)，可开关 | 1d |

### Phase 3: 扩展 (Extend)

| 任务 | 描述 | 预估 |
|------|------|------|
| **X1** Firefox 扩展 | Plasmo 支持 Firefox，需适配 Manifest V2/V3 差异 | 3d |
| **X2** 全文搜索 | SQLite FTS5 全文检索，替代 LIKE 模糊匹配 | 1d |
| **X3** 标签系统 | 记录支持用户自定义标签 (多对多) | 2d |
| **X4** 端到端加密 | 可选的记录加密存储 (SQLCipher 或应用层加密) | 3d |
| **X5** 多窗口支持 | Agent 终端可独立弹出为单独窗口 | 1d |
| **X6** 插件化工具 | Agent 工具动态注册机制，第三方可扩展 | 3d |

### Phase 4: 发布 (Release)

| 任务 | 描述 |
|------|------|
| **R1** Electron 打包 | electron-builder 配置完善 (已初步配置) |
| **R2** Chrome Web Store | 扩展提交审核 |
| **R3** 自动更新 | electron-updater 集成 |
| **R4** 用户文档 | 快速上手指南、FAQ、Agent 命令手册 |

</details>
