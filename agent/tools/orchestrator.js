// Orchestrator for agent tool execution.
// Wires pure handlers to side-effect-producing context, enforcing read/write separation.

const { getHandler, getAllHandlerNames } = require("./handlers");

function createExecuteTool(ctx) {
  const {
    dbAll,
    dbGet,
    dbRun,
    broadcastToExtensions,
    watchlist,
    enabled,
    buildAgentProfile,
    triggerReflectionOnDelete,
    readStore,
  } = ctx;

  function executeRead(name, args) {
    const handler = getHandler(name);
    if (!handler) return { error: "Unknown tool: " + name };
    try {
      return handler(args, {
        readStore,
        watchlist,
        enabled,
        buildAgentProfile,
      });
    } catch (e) {
      return { error: "Tool execution failed: " + e.message };
    }
  }

  function executeWrite(name, args, broadcastFn) {
    const handler = getHandler(name);
    if (!handler) return { error: "Unknown tool: " + name };

    const sideEffects = handler(args, {
      dbAll,
      dbGet,
      dbRun,
      watchlist,
      enabled,
      buildAgentProfile,
    });

    if (sideEffects.error) return sideEffects;

    // Perform side effects
    if (name === "delete_records" && sideEffects._sideEffects) {
      const { deleteIds, deletedRecords, reason } = sideEffects._sideEffects;
      const placeholders = deleteIds.map(() => "?").join(",");
      dbRun(`DELETE FROM records WHERE id IN (${placeholders})`, deleteIds);
      broadcastToExtensions({ type: "recordsCleared" });
      if (deletedRecords.length > 0) {
        setImmediate(() => triggerReflectionOnDelete(deletedRecords));
      }
      return { deleted: sideEffects.deleted, reason };
    }

    if (name === "update_regex_rule" && sideEffects._sideEffects) {
      const { domain, regexFilter, regexTarget, reason } =
        sideEffects._sideEffects;
      const idx = watchlist.findIndex((w) => w.domain === domain);
      if (idx >= 0) {
        watchlist[idx].regexFilter = regexFilter;
        watchlist[idx].regexTarget = regexTarget;
      }
      dbRun(
        "UPDATE watchlist SET regexFilter = ?, regexTarget = ? WHERE domain = ?",
        [regexFilter, regexTarget, domain],
      );
      broadcastToExtensions({ type: "watchlistUpdated", watchlist });
      return {
        updated: sideEffects.updated,
        regex_filter: sideEffects.regex_filter,
        regex_target: sideEffects.regex_target,
        reason,
      };
    }

    if (name === "update_record_score" && sideEffects._sideEffects) {
      const { id, score } = sideEffects._sideEffects;
      dbRun("UPDATE records SET score = ?, updatedAt = ? WHERE id = ?", [
        score,
        Date.now(),
        id,
      ]);
      const record = dbGet("SELECT * FROM records WHERE id = ?", [id]);
      if (record) broadcastToExtensions({ type: "recordUpdated", record });
      return record ? { updated: id, score } : { error: "Record not found" };
    }

    if (name === "add_record" && sideEffects._sideEffects) {
      const { record, reason } = sideEffects._sideEffects;
      dbRun(
        "INSERT INTO records (id, url, title, domain, matchedRule, tabId, timestamp, pinned, score, createdAt, updatedAt, favIconUrl, description, ogImage) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, '', '', '')",
        [
          record.id,
          record.url,
          record.title,
          record.domain,
          record.matchedRule,
          record.tabId,
          record.timestamp,
          record.timestamp,
          record.timestamp,
        ],
      );
      const fullRecord = {
        ...record,
        pinned: 1,
        score: 1,
        createdAt: record.timestamp,
        updatedAt: record.timestamp,
      };
      broadcastToExtensions({ type: "recordAdded", record: fullRecord });
      return { added: record.id, url: record.url, reason };
    }

    return sideEffects;
  }

  function executeTool(name, args, broadcastFn) {
    const tool = ctx.getTool(name);
    if (tool && tool.category === "write") {
      return executeWrite(name, args, broadcastFn);
    }
    return executeRead(name, args);
  }

  executeTool.executeRead = executeRead;
  executeTool.executeWrite = executeWrite;
  executeTool.getAllHandlerNames = getAllHandlerNames;

  return executeTool;
}

module.exports = {
  createExecuteTool,
};
