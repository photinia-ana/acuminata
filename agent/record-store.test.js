// Unit tests for RecordStore
const { RecordStore } = require("./record-store");
const path = require("path");
const fs = require("fs");

// Use an in-memory SQLite DB for tests
const TEST_DB = ":memory:";

function createStore() {
  const store = new RecordStore(TEST_DB, () => {});
  return store;
}

async function initStore() {
  const store = createStore();
  await store.init();
  return store;
}

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("Running RecordStore tests...\n");

  // Test 1: Initialization
  console.log("Test: Initialization");
  const store = await initStore();
  assert(store.db !== null, "Database is initialized");
  assert(store.getWatchlist().length === 1, "Default watchlist has 1 entry");
  assert(store.getWatchlist()[0].domain === "bilibili.com", "Default domain is bilibili.com");

  // Test 2: Watchlist CRUD
  console.log("\nTest: Watchlist CRUD");
  assert(store.addWatchlist({ domain: "example.com", label: "Example", color: "#fff" }) === true, "Add watchlist entry");
  assert(store.addWatchlist({ domain: "example.com", label: "Duplicate", color: "#fff" }) === false, "Duplicate add returns false");
  assert(store.getWatchlist().length === 2, "Watchlist has 2 entries");
  assert(store.removeWatchlist("example.com") === true, "Remove watchlist entry");
  assert(store.removeWatchlist("nonexistent.com") === false, "Remove nonexistent returns false");
  assert(store.getWatchlist().length === 1, "Watchlist back to 1 entry");

  // Test 3: Records CRUD
  console.log("\nTest: Records CRUD");
  const record = {
    id: "test-1",
    url: "https://example.com/video/1",
    title: "Test Video",
    domain: "example.com",
    matchedRule: "example.com",
    tabId: 1,
    timestamp: Date.now(),
    score: 0,
  };
  const inserted = store.insertRecord(record);
  assert(inserted.id === "test-1", "Inserted record has correct id");
  assert(inserted.title === "Test Video", "Inserted record has correct title");

  const fetched = store.getRecordById("test-1");
  assert(fetched !== null, "Can fetch record by id");
  assert(fetched.url === record.url, "Fetched record has correct url");

  // Test 4: Pagination
  console.log("\nTest: Pagination");
  const page1 = store.getRecordsPage(1, 10, "all");
  assert(page1.records.length === 1, "Page 1 has 1 record");
  assert(page1.total === 1, "Total is 1");
  assert(page1.page === 1, "Page number is 1");
  assert(page1.pageSize === 10, "Page size is 10");

  // Test 5: Search
  console.log("\nTest: Search");
  // Set score so search (score >= 0) can find it
  store.updateRecord("test-1", { score: 0 });
  const searchResults = store.searchRecords("Test", 10);
  assert(searchResults.length === 1, "Search finds 1 result");
  const noResults = store.searchRecords("Nonexistent", 10);
  assert(noResults.length === 0, "Search for nonexistent returns 0");

  // Test 6: Pin/Score
  console.log("\nTest: Pin/Score");
  const pinned = store.toggleRecordPin("test-1", true, 5);
  assert(pinned.pinned === 1, "Record is pinned");
  assert(pinned.score === 5, "Record has score 5");

  // Test 7: Delete
  console.log("\nTest: Delete");
  const deleteResult = store.deleteRecords(["test-1"]);
  assert(deleteResult.deletedCount === 1, "Deleted 1 record");
  assert(store.getRecordById("test-1") === null, "Record is gone after delete");

  // Test 8: Stats
  console.log("\nTest: Stats");
  const stats = store.getStats();
  assert(typeof stats.total === "number", "Stats has total");
  assert(typeof stats.today === "number", "Stats has today");
  assert(typeof stats.domainCounts === "object", "Stats has domainCounts");

  // Test 9: Agent Profile
  console.log("\nTest: Agent Profile");
  const profile = store.buildAgentProfile();
  assert(typeof profile === "object", "Profile is an object");
  assert(Array.isArray(profile.preferences), "Profile has preferences array");
  assert(Array.isArray(profile.antiPatterns), "Profile has antiPatterns array");

  // Test 10: Recommendations
  console.log("\nTest: Recommendations");
  store._dbRun(
    "INSERT INTO recommendations (id, url, title, domain, groupLabel, reason, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ["rec-1", "https://example.com", "Test Rec", "example.com", "example.com", "test", 0, Date.now()]
  );
  const recs = store.getRecommendations();
  assert(recs.length === 1, "Got 1 recommendation");
  assert(store.acceptRecommendation("rec-1") !== null, "Accept recommendation creates record");
  assert(store.clearRecommendations() === true, "Clear recommendations works");

  // Test 11: Pending Actions
  console.log("\nTest: Pending Actions");
  store.insertPendingAction("conv-1", "test_tool", { foo: "bar" });
  const pending = store.getPendingActions();
  assert(pending.length === 1, "Got 1 pending action");
  store.resolvePendingAction(pending[0].id, "approved");
  const afterResolve = store.getPendingActions();
  assert(afterResolve.length === 0, "Pending actions cleared after resolve");

  // Test 12: Conversations & Messages
  console.log("\nTest: Conversations & Messages");
  const convId = store.createConversation("test", "system prompt");
  assert(convId !== null, "Conversation created");
  store.insertMessage(convId, 1, "user", "hello", null, null);
  const messages = store._dbAll("SELECT * FROM agent_messages WHERE conversation_id = ?", [convId]);
  assert(messages.length === 1, "Message inserted");
  store.completeConversation(convId, "done");
  const conv = store._dbGet("SELECT * FROM agent_conversations WHERE id = ?", [convId]);
  assert(conv.summary === "done", "Conversation completed");

  // Test 13: Memories
  console.log("\nTest: Memories");
  store.upsertMemory("preference", "dark_mode", "enabled", 0.8, null, null);
  const memories = store.getMemoriesByType("preference");
  assert(memories.length === 1, "Got 1 memory");
  assert(memories[0].key === "dark_mode", "Memory key is correct");

  // Test 14: High-value records extraction
  console.log("\nTest: High-value records extraction");
  store.insertRecord({
    id: "hv-1",
    url: "https://example.com/hv",
    title: "High Value",
    domain: "example.com",
    matchedRule: "example.com",
    tabId: 1,
    timestamp: Date.now(),
    pinned: 1,
    score: 10,
  });
  const hvRecords = store.extractHighValueRecords();
  assert(hvRecords.some((r) => r.id === "hv-1"), "High-value record found");

  // Test 15: Export
  console.log("\nTest: Export");
  const exported = store.export();
  assert(exported instanceof Uint8Array || Buffer.isBuffer(exported), "Export returns buffer");

  console.log("\n✅ All RecordStore tests passed!");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
