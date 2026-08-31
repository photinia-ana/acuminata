const assert = require("assert");
const {
  getHandler,
  getAllHandlerNames,
  HANDLERS,
} = require("./agent/tools/handlers");
const { createExecuteTool } = require("./agent/tools/orchestrator");

// ── Pure handler tests ──

function buildCtx(overrides = {}) {
  return {
    dbAll: () => [],
    dbGet: () => ({}),
    dbRun: () => {},
    watchlist: [{ domain: "example.com", label: "Example" }],
    enabled: true,
    buildAgentProfile: () => ({ antiPatterns: [] }),
    triggerReflectionOnDelete: () => {},
    getTool: (name) => ({ name, category: "read" }),
    ...overrides,
  };
}

console.log("Running handler tests...");

// search_records
const searchResult = getHandler("search_records")({ query: "test", limit: 10 }, buildCtx({ dbAll: () => [{ id: "1", title: "test" }] }));
assert.strictEqual(searchResult.count, 1, "search count");
assert.strictEqual(searchResult.records[0].title, "test", "search record");

// get_record_details found
const detailResult = getHandler("get_record_details")({ id: "1" }, buildCtx({ dbGet: () => ({ id: "1", title: "detail" }) }));
assert.strictEqual(detailResult.id, "1", "detail id");

// get_record_details not found
const notFoundResult = getHandler("get_record_details")({ id: "999" }, buildCtx({ dbGet: () => null }));
assert.strictEqual(notFoundResult.error, "Record not found", "detail not found");

// get_statistics
const statsResult = getHandler("get_statistics")({}, buildCtx({
  dbAll: () => [{ matchedRule: "example.com", count: 5 }],
  dbGet: (sql) => sql.includes("COUNT(*) as total") ? { total: 10 } : { count: 0 },
}));
assert.strictEqual(statsResult.total, 10, "stats total");
assert.strictEqual(statsResult.today, 0, "stats today");
assert.strictEqual(statsResult.domainCounts["Example"], 5, "stats domain label");

// get_watchlist
const watchlistResult = getHandler("get_watchlist")({}, buildCtx());
assert.strictEqual(watchlistResult.count, 1, "watchlist count");
assert.strictEqual(watchlistResult.watchlist[0].domain, "example.com", "watchlist domain");

// delete_records pure
const deleteCtx = buildCtx({ dbAll: () => [{ id: "1", title: "del" }], triggerReflectionOnDelete: () => {} });
const deleteResult = getHandler("delete_records")({ ids: ["1"] }, deleteCtx);
assert.strictEqual(deleteResult.deleted, 1, "delete count");
assert.ok(deleteResult._sideEffects, "delete side effects present");
assert.deepStrictEqual(deleteResult._sideEffects.deleteIds, ["1"], "delete ids");

// update_regex_rule pure
const regexResult = getHandler("update_regex_rule")({ domain: "example.com", regex_filter: "a.*b", regex_target: "url" }, buildCtx());
assert.strictEqual(regexResult.updated, "example.com", "regex updated domain");
assert.strictEqual(regexResult.regex_filter, "a.*b", "regex filter");
assert.deepStrictEqual(regexResult._sideEffects.domain, "example.com", "regex side effects");

// update_record_score pure
const scoreResult = getHandler("update_record_score")({ id: "1", score: 50 }, buildCtx());
assert.strictEqual(scoreResult.score, 50, "score clamped");
assert.deepStrictEqual(scoreResult._sideEffects, { id: "1", score: 50 }, "score side effects");

// add_record pure
const addResult = getHandler("add_record")({ url: "https://example.com", title: "t", domain: "example.com", matched_rule: "example.com" }, buildCtx());
assert.ok(addResult.added.startsWith(Date.now().toString().slice(0, 10)), "add id prefix");
assert.strictEqual(addResult.url, "https://example.com", "add url");
assert.ok(addResult._sideEffects.record.url, "add side effects record");

console.log("Handler tests passed.");

// ── Orchestrator tests ──

function buildMockCtx() {
  return {
    watchlist: [{ domain: "example.com", label: "Example" }],
    enabled: true,
    buildAgentProfile: () => ({ antiPatterns: [] }),
    triggerReflectionOnDelete: () => {},
    getTool: (name) => ({ name, category: name === "delete_records" ? "write" : "read" }),
    dbAll: (sql) => {
      if (sql.includes("id IN")) return [{ id: "1", title: "del" }];
      return [];
    },
    dbGet: (sql) => sql.includes("total") ? { total: 10 } : { count: 0 },
    dbRun: () => {},
    broadcastToExtensions: (msg) => {},
  };
}

console.log("Running orchestrator tests...");

const mockCtx = buildMockCtx();
const executeTool = createExecuteTool(mockCtx);

// Read tool
const searchRead = executeTool("search_records", { query: "test" });
assert.strictEqual(searchRead.count, 0, "orchestrator read count");

// Write tool: delete_records
const deleteWrite = executeTool("delete_records", { ids: ["1"] });
assert.strictEqual(deleteWrite.deleted, 1, "orchestrator delete count");

// Unknown tool
const unknown = executeTool("unknown_tool", {});
assert.strictEqual(unknown.error, "Unknown tool: unknown_tool", "unknown tool error");

console.log("Orchestrator tests passed.");

console.log("All tests passed.");
