/**
 * Unit tests for agent/cluster.js
 * Run with: node agent/cluster.test.js
 */

const { evaluateIncoming } = require('./cluster');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function makeWatchlist(entries) {
  return entries.map((e) => ({
    domain: e.domain,
    label: e.label || "",
    color: e.color || "#5b8dee",
    regexFilter: e.regexFilter || "",
    regexTarget: e.regexTarget || "url",
  }));
}

function makeRecord(overrides = {}) {
  return {
    id: "1",
    url: "https://example.com/video/123",
    title: "Video 123",
    domain: "example.com",
    matchedRule: "example.com",
    tabId: 1,
    timestamp: Date.now() - 100000,
    pinned: 0,
    score: 0,
    createdAt: Date.now() - 100000,
    updatedAt: null,
    ...overrides,
  };
}

async function runTests() {
  console.log('\n── agent/cluster.js unit tests ──\n');

  // ── Drop: regex mismatch ──
  {
    console.log('Drop: regex mismatch');
    const watchlist = makeWatchlist([
      { domain: "example.com", label: "Videos", regexFilter: "^/video/", regexTarget: "url" },
    ]);
    const incoming = {
      url: "https://example.com/article/456",
      title: "Article",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 1,
      timestamp: Date.now(),
    };
    const findExisting = () => null;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "drop", 'drops when regex does not match');
  }

  // ── Drop: regex match required ──
  {
    console.log('Drop: regex match required');
    const watchlist = makeWatchlist([
      { domain: "example.com", label: "Videos", regexFilter: "^/video/", regexTarget: "url" },
    ]);
    const incoming = {
      url: "https://example.com/article/456",
      title: "Article",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 1,
      timestamp: Date.now(),
    };
    const findExisting = () => null;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "drop", 'drops when regex does not match');
  }

  // ── Pass: regex match ──
  {
    console.log('Pass: regex match');
    const watchlist = makeWatchlist([
      { domain: "example.com", label: "Videos", regexFilter: "example\\.com/video/", regexTarget: "url" },
    ]);
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 1,
      timestamp: Date.now(),
    };
    const findExisting = () => null;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "insert", 'inserts when regex matches');
  }

  // ── Ignore: same tab within 60s ──
  {
    console.log('Ignore: same tab within 60s');
    const watchlist = makeWatchlist([{ domain: "example.com", label: "Videos" }]);
    const existing = makeRecord({ tabId: 1, timestamp: Date.now() - 30000 });
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 1,
      timestamp: Date.now(),
    };
    const findExisting = () => existing;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "ignore", 'ignores duplicate within 60s on same tab');
  }

  // ── Update: different tab or >60s ──
  {
    console.log('Update: existing found');
    const watchlist = makeWatchlist([{ domain: "example.com", label: "Videos" }]);
    const existing = makeRecord({ tabId: 1, timestamp: Date.now() - 120000, pinned: 0, score: 0 });
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 2,
      timestamp: Date.now(),
    };
    const findExisting = () => existing;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "update", 'updates existing record');
    assert(result.record.pinned === 1, 'pins on first revisit');
    assert(result.record.score === 1, 'scores 1 on first revisit');
    assert(result.updates.url === incoming.url, 'updates url');
  }

  // ── Update: daily scoring cap ──
  {
    console.log('Update: daily scoring cap');
    const watchlist = makeWatchlist([{ domain: "example.com", label: "Videos" }]);
    const existing = makeRecord({
      tabId: 1,
      timestamp: Date.now() - 86400000,
      pinned: 1,
      score: 5,
      updatedAt: Date.now() - 86400000,
      createdAt: Date.now() - 86400000,
    });
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 2,
      timestamp: Date.now(),
    };
    const findExisting = () => existing;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "update", 'updates existing record');
    assert(result.record.score === 6, 'increments score by 1');
  }

  // ── Update: no double score same day ──
  {
    console.log('Update: no double score same day');
    const watchlist = makeWatchlist([{ domain: "example.com", label: "Videos" }]);
    const existing = makeRecord({
      tabId: 1,
      timestamp: Date.now() - 86400000,
      pinned: 1,
      score: 5,
      updatedAt: Date.now() - 3600000,
      createdAt: Date.now() - 86400000,
    });
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 2,
      timestamp: Date.now(),
    };
    const findExisting = () => existing;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "update", 'updates existing record');
    assert(result.record.score === 5, 'does not increment score when already updated today');
  }

  // ── Insert: no existing ──
  {
    console.log('Insert: no existing');
    const watchlist = makeWatchlist([{ domain: "example.com", label: "Videos" }]);
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 1,
      timestamp: Date.now(),
      favIconUrl: "https://example.com/favicon.ico",
      description: "A great video",
      ogImage: "https://example.com/og.jpg",
    };
    const findExisting = () => null;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "insert", 'inserts new record');
    assert(result.record.url === incoming.url, 'preserves url');
    assert(result.record.favIconUrl === incoming.favIconUrl, 'preserves favIconUrl');
    assert(result.record.description === incoming.description, 'preserves description');
    assert(result.record.ogImage === incoming.ogImage, 'preserves ogImage');
  }

  // ── Group resolution: fallback to domain ──
  {
    console.log('Group resolution: fallback to domain');
    const watchlist = makeWatchlist([{ domain: "example.com", label: "" }]);
    const incoming = {
      url: "https://example.com/video/123",
      title: "Video 123",
      domain: "example.com",
      matchedRule: "example.com",
      tabId: 1,
      timestamp: Date.now(),
    };
    const findExisting = () => null;
    const result = evaluateIncoming(incoming, watchlist, findExisting);
    assert(result.action === "insert", 'inserts when groupLabel falls back to domain');
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
