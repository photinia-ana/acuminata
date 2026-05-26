# /dbcheck — Database Health Check

Run a comprehensive health check on the Acuminata SQLite database.

## Steps

1. **Locate the database file**: Check `C:\Roy\workspace\browser-history-tracker\tracker.db` (or path from config). If not found, check for `.db` files in the project root.

2. **Connect and run these checks** (use `sqlite3` CLI or read the DB via sql.js):

```sql
-- Table integrity
PRAGMA integrity_check;

-- Row counts per table
SELECT 'categories' as tbl, COUNT(*) as cnt FROM categories
UNION ALL SELECT 'records', COUNT(*) FROM records
UNION ALL SELECT 'actions', COUNT(*) FROM actions
UNION ALL SELECT 'agents', COUNT(*) FROM agents
UNION ALL SELECT 'agentRuns', COUNT(*) FROM agentRuns
UNION ALL SELECT 'agentMemories', COUNT(*) FROM agentMemories
UNION ALL SELECT 'triggers', COUNT(*) FROM triggers;

-- Index coverage
SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name;

-- Orphaned records (categoryId references non-existent category)
SELECT COUNT(*) as orphaned_records FROM records r
  LEFT JOIN categories c ON r.categoryId = c.id
  WHERE c.id IS NULL AND r.categoryId IS NOT NULL;

-- Orphaned agent runs (recordId references non-existent record)
SELECT COUNT(*) as orphaned_agent_runs FROM agentRuns ar
  LEFT JOIN records r ON ar.recordId = r.id
  WHERE r.id IS NULL;

-- Recent activity (last 24h)
SELECT 'recent_records' as metric, COUNT(*) as value FROM records
  WHERE createdAt > datetime('now', '-1 day')
UNION ALL SELECT 'recent_agent_runs', COUNT(*) FROM agentRuns
  WHERE createdAt > datetime('now', '-1 day');

-- Unassigned records (no category)
SELECT COUNT(*) as unassigned FROM records
  WHERE categoryId IS NULL AND isIgnored = 0;
```

3. **Summarize results** in a table:

| Metric | Value |
|--------|-------|
| Integrity | ✅/❌ |
| Categories | N |
| Records | N |
| Actions | N |
| Agents | N |
| Agent Runs | N |
| Agent Memories | N |
| Triggers | N |
| Orphaned Records | N |
| Orphaned Agent Runs | N |
| Recent Records (24h) | N |
| Recent Agent Runs (24h) | N |
| Unassigned Records | N |

4. **Flag issues**:
   - 🔴 Integrity check failed
   - 🟡 Orphaned records > 0
   - 🟡 Orphaned agent runs > 0
   - 🟡 Unassigned records > 0
