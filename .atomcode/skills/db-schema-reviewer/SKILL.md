# Database Schema Reviewer

Review database schema changes for compatibility with the Acuminata project's existing data and queries.

## Existing Schema

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

## Review Checklist

### 1. Backward Compatibility
- **addColumn**: Safe — SQLite ignores existing columns
- **renameColumn**: ⚠️ DANGEROUS — existing queries using old column name will break
- **dropColumn**: 🔴 CRITICAL — data loss; ensure no queries reference this column
- **modifyColumn** (type change): ⚠️ Check if existing data can be cast without loss

### 2. Query Compatibility
- After any schema change, verify these critical queries still work:
  - Category assignment: `SELECT r.*, c.name as categoryName FROM records r LEFT JOIN categories c ON r.categoryId = c.id`
  - Agent runs with records: `SELECT ar.*, r.title, r.url FROM agentRuns ar LEFT JOIN records r ON ar.recordId = r.id`
  - Trigger matching: `SELECT * FROM triggers WHERE type = ? AND pattern LIKE ?`
  - Record stats: `SELECT categoryId, COUNT(*) as count FROM records WHERE isIgnored = 0 GROUP BY categoryId`

### 3. Migration Strategy
- All ALTER TABLE statements should be wrapped in try/catch with `IF NOT EXISTS` guards
- For destructive changes (rename/drop), create migration scripts in `docs/migrations/`
- Test with sample data: verify no data loss after migration

### 4. Index Coverage
- Flag any new column used in WHERE/JOIN without corresponding index
- Critical indexes: `records(categoryId)`, `records(isIgnored)`, `triggers(type, pattern)`

## Review Protocol

When invoked:
1. Read the schema change diff
2. Check backward compatibility (will existing queries break?)
3. Check data integrity (will existing data be lost or corrupted?)
4. Check index coverage (are new queryable columns indexed?)
5. Report findings as:
   - 🔴 **Breaking**: Queries will fail or return wrong results
   - 🟡 **Warning**: Performance risk or minor incompatibility
   - 🟢 **Safe**: Change is backward compatible
