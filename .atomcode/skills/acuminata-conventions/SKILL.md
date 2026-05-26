# Acuminata Project Conventions

You are working on **Acuminata** — a privacy-first browser history tracker with AI-powered categorization and self-reflection.

## Architecture

- **Dual-mode**: Electron desktop app (main process) + Chrome extension (Plasmo + React + TypeScript)
- **IPC bridge**: Electron uses `ipcMain`/`ipcRenderer` for renderer ↔ main communication
- **Extension bridge**: Chrome extension connects to Electron via WebSocket (`ws://127.0.0.1:8766`)
- **Database**: SQLite via sql.js (WASM), 7 tables — see schema section below
- **AI**: 3 providers (Ollama / OpenAI / Anthropic) with Tool Calling + Agent Loop + Self-reflection

## Design System (Runway)

- **Theme**: Extreme dark — `#0a0a0a` background, `#ededed` text, `#1a1a1a` cards, `#2a2a2a` borders
- **Font**: Inter (14px base, 500 weight for body, 600 for labels)
- **Borders**: 1px solid `rgba(255,255,255,0.1)` — no heavy borders, no shadows
- **Spacing**: 12px standard, 8px compact, 16px section gaps
- **Buttons**: `#1a1a1a` bg, `#ededed` text, hover `#2a2a2a`; primary uses `#6366f1` (indigo-500)
- **NO**: rounded corners > 8px, gradients, box-shadows, colorful accents beyond indigo
- **Icons**: 16px inline SVG only — no icon libraries, no emoji

## Database Schema

```sql
-- Core tables
categories(id, name, icon, description, prompt, sortOrder, isAuto, isDefault, createdAt, updatedAt)
records(id, url, title, visitCount, lastVisitTime, categoryId, isRead, isIgnored, createdAt, updatedAt)
actions(id, type, data, status, result, createdAt, updatedAt)

-- AI Agent system
agents(id, name, description, status, createdAt, updatedAt)
agentRuns(id, agentId, recordId, status, result, createdAt, updatedAt)
agentMemories(id, agentId, key, value, source, createdAt, updatedAt)

-- Auto-categorization triggers
triggers(id, type, pattern, categoryId, priority, createdAt, updatedAt)
```

## Code Conventions

- **Main process** (`main.js`): 2000+ lines single file — when editing, keep structure flat (no class wrappers), use clear section comments `// ===== Section Name =====`
- **Extension TSX**: Use React functional components + hooks; Plasmo auto-exports from default export
- **AI Provider calls**: Always use Tool Calling format; Agent loop pattern: `call → execute tools → reflect → call again`
- **WebSocket**: Extension → Electron on `ws://127.0.0.1:8766`; messages are JSON `{type, data}`
- **i18n**: All user-facing strings must be in `locales/en.json` and `locales/zh-CN.json` — never hardcode
- **SQL**: Use parameterized queries (`?` placeholders) — never string concatenation

## File Ownership

- `main.js` — Electron main process (single instance, IPC handlers, AI, DB)
- `extend/` — Chrome extension (Plasmo framework)
- `shared/types.d.ts` — Shared TypeScript interfaces (both Electron and extension use these)
- `locales/*.json` — Internationalization (112+ keys each)
- `gencert.js` — HTTPS cert generation for extension → Electron communication

## Testing Gaps (Priority)

1. AI Tool Calling response parsing (XML → JSON)
2. WebSocket message handling
3. SQL query correctness (especially JOINs for category assignment)
4. Agent self-reflection loop logic
